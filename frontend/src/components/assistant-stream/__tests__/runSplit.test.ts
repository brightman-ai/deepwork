/**
 * runSplit / terminalNotice / formatRunDuration — AgentRun 投影拆分逻辑测试。
 * 断言权威分离 (message.finalBlocks 存在时零猜测) + live 兜底的终态守卫 (被中断的轮尾部
 * 叙述不许冒充答案) + attention 段强制可见 + 终态文案降级 + 时长格式化。
 * Imports the REAL exported functions directly (repo convention, e.g.
 * composables/channel/strategies/__tests__/*.test.ts).
 */
import { describe, test, expect } from 'bun:test'
import { splitRun, terminalNotice, formatRunDuration } from '../runSplit'
import type { AssistantBlock, AssistantMessage } from '../types'

function msg(over: Partial<AssistantMessage> = {}): AssistantMessage {
  return { id: 'm1', role: 'assistant', ...over }
}

const textBlock = (content: string): AssistantBlock => ({ type: 'text', content })
const toolGroup = (): AssistantBlock => ({ type: 'tool-group', tools: [{ id: 't1', name: 'Bash' }] })
const permissionBlock = (): AssistantBlock => ({ type: 'permission', content: '需要批准' })
const errorBlock = (): AssistantBlock => ({ type: 'error', message: '出错了' })
const waitingBlock = (): AssistantBlock => ({ type: 'waiting', status: 'waiting' })

describe('splitRun', () => {
  test('① msg.finalBlocks 存在 → final 用它、trace = blocks (权威分离, 零猜测)', () => {
    const blocks = [toolGroup(), textBlock('过程叙述，看起来像答案')]
    const finalBlocks = [textBlock('真正的答案')]
    const m = msg({ finalBlocks })
    const split = splitRun(m, blocks)
    expect(split.trace).toBe(blocks) // 原样引用，未做任何位置猜测切割
    expect(split.final).toBe(finalBlocks)
    expect(split.final).toEqual([textBlock('真正的答案')])
  })

  test('② live 无 finalBlocks + runStatus=interrupted → final 为空 (尾部叙述不许冒充答案)', () => {
    const blocks = [toolGroup(), textBlock('被打断前的最后一句叙述')]
    const m = msg({ runStatus: 'interrupted' })
    const split = splitRun(m, blocks)
    expect(split.final).toEqual([])
    expect(split.trace).toBe(blocks)
  })

  test('live 无 finalBlocks + runStatus=error/unterminated → 同样 final 为空', () => {
    const blocks = [textBlock('中途文本')]
    expect(splitRun(msg({ runStatus: 'error' }), blocks).final).toEqual([])
    expect(splitRun(msg({ runStatus: 'abandoned' }), blocks).final).toEqual([])
  })

  test('③ live 正常 (无 runStatus 或 completed) → 尾部连续 text = final', () => {
    const blocks = [toolGroup(), textBlock('第一段答案'), textBlock('第二段答案')]
    const split = splitRun(msg(), blocks)
    expect(split.trace).toEqual([toolGroup()])
    expect(split.final).toEqual([textBlock('第一段答案'), textBlock('第二段答案')])
  })

  test('live 正常 + completed 状态 → 同③规则', () => {
    const blocks = [toolGroup(), textBlock('答案')]
    const split = splitRun(msg({ runStatus: 'completed' }), blocks)
    expect(split.final).toEqual([textBlock('答案')])
  })

  test('live 正常但全是非 text 块 → final 为空、trace = 全部', () => {
    const blocks = [toolGroup(), permissionBlock()]
    const split = splitRun(msg(), blocks)
    expect(split.trace).toEqual(blocks)
    expect(split.final).toEqual([])
  })

  test('④ attention: permission/error/waiting 出现在 trace 里 → attention=true', () => {
    expect(splitRun(msg(), [toolGroup(), permissionBlock()]).attention).toBe(true)
    expect(splitRun(msg(), [toolGroup(), errorBlock()]).attention).toBe(true)
    expect(splitRun(msg(), [toolGroup(), waitingBlock()]).attention).toBe(true)
  })

  test('attention: finalBlocks 存在时按整段 blocks 判定 (不因切走 final 而漏判)', () => {
    const blocks = [permissionBlock()]
    const split = splitRun(msg({ finalBlocks: [] }), blocks)
    expect(split.attention).toBe(true)
  })

  test('attention: interrupted 分支也按 trace (=blocks) 判定', () => {
    const split = splitRun(msg({ runStatus: 'interrupted' }), [waitingBlock()])
    expect(split.attention).toBe(true)
  })

  test('无 attention 段 → attention=false', () => {
    expect(splitRun(msg(), [toolGroup(), textBlock('答案')]).attention).toBe(false)
  })
})

describe('terminalNotice', () => {
  test('⑤ interrupted → 已停止', () => {
    const m = msg({ runStatus: 'interrupted' })
    const split = splitRun(m, [textBlock('叙述')])
    expect(terminalNotice(m, split)).toBe('已停止')
  })

  test('error → 执行失败', () => {
    const m = msg({ runStatus: 'error' })
    const split = splitRun(m, [textBlock('叙述')])
    expect(terminalNotice(m, split)).toBe('执行失败')
  })

  test('abandoned → 未完成（会话已中断，无最终答复）', () => {
    const m = msg({ runStatus: 'abandoned' })
    const split = splitRun(m, [textBlock('叙述')])
    expect(terminalNotice(m, split)).toBe('未完成（会话已中断，无最终答复）')
  })

  test('有答案 → null (不渲染状态行)', () => {
    const m = msg()
    const split = splitRun(m, [textBlock('答案')])
    expect(terminalNotice(m, split)).toBeNull()
  })

  test('streaming 中 → null (仍在跑, 不下结论)', () => {
    const m = msg({ streaming: true })
    const split = splitRun(m, [toolGroup()])
    expect(terminalNotice(m, split)).toBeNull()
  })

  test('无终态事实但有 attention 段 → 等待输入', () => {
    const m = msg()
    const split = splitRun(m, [permissionBlock()])
    expect(terminalNotice(m, split)).toBe('等待输入')
  })

  test('无终态事实、无 attention、无答案 → null (无话可说, 不编造)', () => {
    const m = msg()
    const split = splitRun(m, [toolGroup()])
    expect(terminalNotice(m, split)).toBeNull()
  })
})

describe('formatRunDuration', () => {
  test('⑥ 59s → "59s"', () => {
    expect(formatRunDuration(59_000)).toBe('59s')
  })

  test('469000ms → "7m49s"', () => {
    expect(formatRunDuration(469_000)).toBe('7m49s')
  })

  test('undefined → ""', () => {
    expect(formatRunDuration(undefined)).toBe('')
  })

  test('整分钟不带零秒: 120000ms → "2m"', () => {
    expect(formatRunDuration(120_000)).toBe('2m')
  })

  test('非法值 (负数/NaN) → "" (诚实降级, 不显示垃圾)', () => {
    expect(formatRunDuration(-1)).toBe('')
    expect(formatRunDuration(Number.NaN)).toBe('')
  })

  test('0ms → "0s"', () => {
    expect(formatRunDuration(0)).toBe('0s')
  })
})

// 真实数据里存在的一态：runtime 报 task_complete，但整轮没产出答复文本（最后一步是工具调用
// 或用户插话就结束了）。若 UI 只显示"折叠的过程 + 空白"，就是「空 AI 回答」病灶换壳。
describe('terminalNotice — completed with no answer (real codex run #10)', () => {
  test('says so instead of leaving a blank body', () => {
    const msg = { id: 'm', role: 'assistant', runStatus: 'completed' } as never
    const split = { trace: [{ type: 'tool-group', tools: [] }], final: [], attention: false } as never
    expect(terminalNotice(msg, split)).toBe('本轮无最终答复（只有执行过程）')
  })
  test('stays silent when a completed run has an answer', () => {
    const msg = { id: 'm', role: 'assistant', runStatus: 'completed' } as never
    const split = { trace: [], final: [{ type: 'text', content: 'done' }], attention: false } as never
    expect(terminalNotice(msg, split)).toBeNull()
  })
})

// transcript 是**追加流**不是快照：一个"历史"会话可能正被外部 CLI 写着。给它盖「未完成」
// 的章 = 把活的说成死的。后端 join 了 liveness 事实（sessionactivity）才区分得出来。
describe('running（外部 CLI 仍在写这个 transcript）', () => {
  test('不出终态文案 —— 它还在跑，不是"未完成"', () => {
    const msg = { id: 'm', role: 'assistant', runStatus: 'running' } as never
    const split = { trace: [{ type: 'tool-group', tools: [] }], final: [], attention: false } as never
    expect(terminalNotice(msg, split)).toBeNull()
  })
  test('尾部文本仍算正在生成的答复（不像 interrupted 那样被降级为叙述）', () => {
    const msg = { id: 'm', role: 'assistant', runStatus: 'running' } as never
    const blocks = [{ type: 'tool-group', tools: [] }, { type: 'text', content: '快好了' }] as never
    const s = splitRun(msg, blocks)
    expect(s.final).toHaveLength(1)
  })
})
