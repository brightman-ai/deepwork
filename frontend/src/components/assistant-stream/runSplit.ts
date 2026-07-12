// AgentRun 投影：一次回应 = [ProcessTrace(过程) + FinalAnswer(结果)]。
//
// **权威来源是后端的领域事实**：kit 的 AgentRun 把「runtime 让出控制权那次迭代的文本」
// 标成 FinalAnswer（claude stop_reason=end_turn / codex task_complete 前的消息），装配方
// 经 message.finalBlocks 传进来。这不是「最后一个 text 块」那种位置猜测 —— 位置规则有两个
// 真实反例：① 被中断的 run，尾部叙述会冒充答案；② 答案后面跟了一条通知，真答案又被塞回过程。
//
// live 流（workstream 归约 SSE）拿不到后端 run 事实 → 退化为位置规则，但**受终态守卫**：
// 只有正常收束（未中断/未失败）的轮，尾部文本才算答案。
import type { AssistantBlock, AssistantMessage } from './types'

export interface RunSplit {
  /** 过程段：原时序、原 id、原数量。折叠只是可见性，不改内容。 */
  trace: AssistantBlock[]
  /** 最终答案：永远在可折叠容器**之外**，不会被收起。 */
  final: AssistantBlock[]
  /** 需要人处理的事（审批/错误/等待）→ 强制展开、禁止自动收口。 */
  attention: boolean
}

// 需要人行动的段：它们出现在过程里，也绝不能被折叠藏住。
const ATTENTION_KINDS = new Set(['permission', 'error', 'waiting'])

// 没有答案的终态：这类轮的尾部文本是"过程叙述"，不是答案（位置规则的反例①）。
const NO_ANSWER_STATUS = new Set(['interrupted', 'error', 'unterminated'])

export function splitRun(msg: AssistantMessage, blocks: AssistantBlock[]): RunSplit {
  const attentionOf = (bs: AssistantBlock[]) => bs.some((b) => ATTENTION_KINDS.has(b.type))

  // 后端已给出权威分离（回放/分享）→ 直接用，零猜测。
  if (msg.finalBlocks !== undefined) {
    return { trace: blocks, final: msg.finalBlocks, attention: attentionOf(blocks) }
  }

  // live 兜底：尾部连续 text = 答案，但仅当这一轮正常收束。
  if (msg.runStatus && NO_ANSWER_STATUS.has(msg.runStatus)) {
    return { trace: blocks, final: [], attention: attentionOf(blocks) }
  }
  let cut = blocks.length
  while (cut > 0 && blocks[cut - 1]?.type === 'text') cut--
  const trace = blocks.slice(0, cut)
  return { trace, final: blocks.slice(cut), attention: attentionOf(trace) }
}

// run 终态（kit AgentRun.status 的镜像；live 期为空 = 仍在跑）。
export type AssistantRunStatus = 'completed' | 'interrupted' | 'error' | 'unterminated'

// 没有最终答案时该说什么 —— 诚实降级：不渲染空正文，也不假装「完成」。
// null = 有答案（或仍在跑），无需状态行。
export function terminalNotice(msg: AssistantMessage, split: RunSplit): string | null {
  if (msg.streaming || split.final.length > 0) return null
  switch (msg.runStatus) {
    case 'interrupted': return '已停止'
    case 'error': return '执行失败'
    case 'unterminated': return '未完成（会话中断，无最终答复）'
    // 真实数据里存在这种轮：runtime 报告 task_complete，但从头到尾没产出答复文本
    // （最后一步是工具调用/用户插话就结束了）。此时**必须说出来** —— 否则折叠的过程下面
    // 空空如也，又变回「空 AI 回答」那个病灶，只是换了个壳。
    case 'completed': return split.trace.length ? '本轮无最终答复（只有执行过程）' : '本轮无输出'
    default:
      // 无终态事实但有 attention 段 → 它在等人
      if (split.attention) return '等待输入'
      // 既没过程也没答复也没终态 —— 只剩一个头像和一行指标，那是最原始的「空 AI 回合」。
      return split.trace.length ? null : '本轮无输出'
  }
}

// 「正在处理 · 12s」/「已处理 · 7m49s」。运行态与完成态语义必须一致 —— 运行中绝不写「已处理」。
export function formatRunDuration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return ''
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rest = s % 60
  return rest === 0 ? `${m}m` : `${m}m${rest}s`
}
