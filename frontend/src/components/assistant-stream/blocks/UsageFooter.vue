<script setup lang="ts">
// CHG-014 D2: 重塑到原型 rmeta 轮次 footer (原型 1107)。
// TTFT△ / 总耗时 / ↓in ↑out / 缓存读 / 模型 / 时间 + hover 动作钮 (⧉⟳⤴⑂)。
// 数据 ← D5① turns。缺源字段一律显「—」(不省整行，保持栅格稳定)。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { isThinkingWithheld } from '../types'
import type { AssistantMessage, AssistantUsageInfo } from '../types'

const props = withDefaults(defineProps<{
  message: AssistantMessage
  streaming?: boolean
  // F2: 消费点未接 copy/retry/project/branch → 不渲染动作钮（数据诚实，metrics 行照常显示）。
  actionable?: boolean
  // AgentRun 消费点（WS/share）：移动端 footer 不许占多行。处理耗时已经在 ProcessTrace
  // 标题上（「已处理 · 7m49s」），这里再占一整行是重复噪音 —— 窄屏只留「tokens · 模型」，
  // 其余指标收进「详情」（一次点击可见，不是删掉）。其它 portal 不传 → 行为完全不变。
  compactMobile?: boolean
}>(), {
  actionable: true,
  compactMobile: false,
})

// 窄屏信号（与 Surface 同口径 768px）。SSR 安全。
const isNarrow = ref(false)
let mq: MediaQueryList | null = null
function onMq(e: MediaQueryListEvent | MediaQueryList): void { isNarrow.value = e.matches }
onMounted(() => {
  if (typeof window === 'undefined' || !window.matchMedia) return
  mq = window.matchMedia('(max-width: 768px)')
  onMq(mq)
  mq.addEventListener('change', onMq)
})
onBeforeUnmount(() => { mq?.removeEventListener('change', onMq) })

// 窄屏且消费点要求紧凑 → 只显主指标；其余走「详情」。
const compact = computed(() => props.compactMobile && isNarrow.value)
const detailsOpen = ref(false)

// W1G3: 「总耗时」诚实走动。`Date.now()` is not reactive, so a plain computed froze the
// streaming elapsed at the value captured on first render (the reported "总耗时 0.0s 全程
// 冻结" during a long, low-event OD/WS turn). Tick a `now` ref every 500ms WHILE streaming
// so the elapsed re-computes; stop the timer the moment streaming ends (the frozen
// elapsed_ms then wins) to avoid a leaked interval. Mirrors WaitingBlock's live counter.
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null
function stopTimer(): void {
  if (timer) { clearInterval(timer); timer = null }
}
watch(
  () => props.streaming && !!props.message.started_at_ms,
  (live) => {
    stopTimer()
    if (live) {
      now.value = Date.now()
      timer = setInterval(() => { now.value = Date.now() }, 500)
    }
  },
  { immediate: true },
)
onBeforeUnmount(stopTimer)

const emit = defineEmits<{
  (e: 'copy'): void
  (e: 'retry'): void
  (e: 'project'): void
  (e: 'branch'): void
}>()

function elapsedFrom(startedAt: number): string {
  // Use the ticking `now` ref (not Date.now()) so this re-computes while streaming.
  return `${((now.value - startedAt) / 1000).toFixed(1)}s`
}

const usage = computed<AssistantUsageInfo | undefined>(() => props.message.live_usage ?? props.message.usage)

// 缺数据 → 「—」哨兵。运行时可得的 TTFT 带 △ 软标。
// CHG-015 P3c: ≥1000 折算为「6.0k」风格（mono footer 紧凑可读），<1000 原样整数。
function num(value?: number): string {
  if (value === undefined || value < 0) return '—'
  const v = Math.round(value)
  if (v >= 1000) {
    const k = v / 1000
    // 10k 以上不留小数（28.0k→28k 太长无益），1k–10k 留一位（6.0k）。
    return k >= 10 ? `${Math.round(k)}k` : `${k.toFixed(1)}k`
  }
  return String(v)
}

const ttft = computed(() => {
  const ms = usage.value?.ttft_ms
  return ms === undefined || ms < 0 ? '—' : `${(ms / 1000).toFixed(1)}s`
})

const elapsed = computed(() => {
  if (props.streaming && props.message.started_at_ms) return elapsedFrom(props.message.started_at_ms)
  if (props.message.elapsed_ms) return `${(props.message.elapsed_ms / 1000).toFixed(1)}s`
  return '—'
})

// CHG-015 P3c: in/out token 行，k 折算。格式「↓28 / ↑6.0k」(/thinking 若有再补一段)。
// 全缺 → 「—」(保栅格)。thinking 仅在源字段存在时追加 (claude reasoning token 才有)。
// 「本轮想了但没给正文」。**必须逐轮判断，不能按模型一刀切**：同一会话里换模型是常事，
// 而会公开思考的模型（Haiku 4.5）思考是看得见的 —— 对它说"你看不到"就是撒谎。
// 判据取这条消息自己有没有带正文的 thinking 块 = 这一轮的地面真相，不依赖任何模型清单。
const thinkingWithheld = computed(() => isThinkingWithheld(props.message))
const tokensIO = computed(() => {
  const i = usage.value?.input_tokens
  const o = usage.value?.output_tokens
  const th = usage.value?.thinking_tokens
  if (i === undefined && o === undefined && th === undefined) return '—'
  const parts = [`↓${num(i)}`, `↑${num(o)}`]
  // Reasoning tokens: show ✻N only when there are ACTUALLY reasoning tokens (>0). A source
  // that redacts extended thinking (e.g. a Claude subscription) reports thinking_tokens=0,
  // and「✻0」on a visibly-reasoning turn reads as "zero thinking" — misleading. 0/absent →
  // omit ✻ (honest: we have no reasoning count to show, not "it reasoned zero").
  // ✻N 只在**看得见思考**时并进这一串；被隐去时它挪到旁边那个可点控件上（见模板），
  // 因为那时"517"和"为什么看不到"是同一件事，拆成两处读者要自己拼。
  // 注意别把 ✻N 整个删掉 —— 模型确实想了 517 tokens，那是真实数据，丢掉就是不诚实。
  if (th !== undefined && th > 0 && !thinkingWithheld.value) parts.push(`✻${num(th)}`)
  return parts.join(' / ')
})
const thinkingTokens = computed(() => {
  const th = usage.value?.thinking_tokens
  return th !== undefined && th > 0 ? th : 0
})

// 为什么需要解释: ✻517 摆在那儿、转录里却找不到对应内容，最省力的解读是"它坏了"。
// 事实是上游模型行为 —— Opus 4.8 / Sonnet 5 不返回思考正文，只返回一枚**校验签名**
// （解码后 84% 不透明字节，仅含模型标识/块 uuid；不是"加密正文"，没有钥匙能解出内容，
// 它的用途是续接时校验这段思考未被篡改）；Haiku 4.5 则逐字返回。三条通道实测一致：
// 实时增量 thinking_delta 无、组装消息块空、rollout 转录 "thinking":"" 全空。
// 用 details 而非 title: title 在移动端没有 hover = 那里等于不存在。
const withheldNote =
  '模型思考了，但没有公开思考过程 —— 它只回了一枚校验签名（用于续接时验证思考未被篡改），' +
  '不是可解密的正文。这是模型自身的行为，不是这里出了问题；换用会公开思考的模型即可看到过程。'

// CHG-015 P5c: 缓存读为空时不渲染该项（只在 WorkArea 总览显）。footer 仅当确有正值才显。
const cacheReadValue = computed(() => usage.value?.cache_read_tokens)
const hasCacheRead = computed(() => {
  const v = cacheReadValue.value
  return v !== undefined && v > 0
})
const cacheRead = computed(() => num(cacheReadValue.value))
// SSOT: per-turn 实测模型 (usage.model, live 从 meta.model / replay 从 usage 块) 优先，
// 回落 message.runtime?.model (会话意图)。两源皆缺 → 「—」(诚实, 订阅版从不上报模型)。
const model = computed(() => usage.value?.model || props.message.runtime?.model || '—')
const withheldOpen = ref(false)
const withheldNoteRef = ref<HTMLElement | null>(null)
// footer 通常就在滚动区最底部，展开的说明会落在可视区外/被 composer 压住 —— 点了像没反应。
// 展开后把它滚进来，让"点击→看见结果"这条链闭合（Norman: 操作必须有可见反馈）。
function toggleWithheld(): void {
  withheldOpen.value = !withheldOpen.value
  if (!withheldOpen.value) return
  void nextTick(() => withheldNoteRef.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
}
const clock = computed(() => {
  const ts = props.message.started_at_ms
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
})
</script>

<template>
  <div class="v6-rmeta" data-testid="assistant-usage-footer">
    <!-- 窄屏紧凑态：主指标一行（tokens · 模型），其余进「详情」。耗时不重复 —— 它在
         ProcessTrace 标题上。 -->
    <span v-if="compact" class="v6-rmeta__t">
      <span>{{ tokensIO }}</span>
      <button
        v-if="thinkingWithheld"
        type="button"
        class="v6-rmeta__withheld"
        :aria-expanded="withheldOpen"
        :aria-label="`思考 ${thinkingTokens} tokens，未公开思考过程 —— 点击了解原因`"
        data-testid="thinking-withheld"
        @click="toggleWithheld"
      >✻{{ num(thinkingTokens) }} 思考未公开 <i class="v6-rmeta__vol">?</i></button>
      <span>{{ model }}</span>
      <button type="button" class="v6-rmeta__more" :aria-expanded="detailsOpen" @click="detailsOpen = !detailsOpen">
        {{ detailsOpen ? '收起' : '详情' }}
      </button>
    </span>
    <span v-else class="v6-rmeta__t">
      <span title="TTFT 仅运行时可得">TTFT {{ ttft }}<i class="v6-rmeta__vol">△</i></span>
      <span>总耗时 {{ elapsed }}</span>
      <span>{{ tokensIO }}</span>
      <button
        v-if="thinkingWithheld"
        type="button"
        class="v6-rmeta__withheld"
        :aria-expanded="withheldOpen"
        :aria-label="`思考 ${thinkingTokens} tokens，未公开思考过程 —— 点击了解原因`"
        data-testid="thinking-withheld"
        @click="toggleWithheld"
      >✻{{ num(thinkingTokens) }} 思考未公开 <i class="v6-rmeta__vol">?</i></button>
      <span v-if="hasCacheRead">缓存读 {{ cacheRead }}</span>
      <span>{{ model }}</span>
      <span>{{ clock }}</span>
    </span>
    <span v-if="props.actionable && !compact" class="v6-rmeta__acts">
      <button type="button" @click="emit('copy')">⧉ 复制</button>
      <button type="button" @click="emit('retry')">⟳ 重试</button>
      <button type="button" @click="emit('project')">⤴ 投影</button>
      <button type="button" @click="emit('branch')">⑂ 分支</button>
    </span>
    <!-- 详情：窄屏收起来的次级指标（可见，不是被删） -->
    <span v-if="compact && detailsOpen" class="v6-rmeta__details">
      <span title="TTFT 仅运行时可得">TTFT {{ ttft }}<i class="v6-rmeta__vol">△</i></span>
      <span>总耗时 {{ elapsed }}</span>
      <span v-if="hasCacheRead">缓存读 {{ cacheRead }}</span>
      <span>{{ clock }}</span>
    </span>
    <!-- 展开式说明：title 在移动端没有 hover = 等于不存在，所以用点击展开。
         中性弱化、无警告色 —— 这是模型属性，不是错误，配色不该替上游道歉。 -->
    <p v-if="withheldOpen" ref="withheldNoteRef" class="v6-rmeta__note" data-testid="thinking-withheld-note">
      {{ withheldNote }}
    </p>
  </div>
</template>

<style scoped>
/* 「思考未公开」——次级信息：不用警告色（它不是错误），只比周围略亮一点点，
   带下划虚线表示"可以点开看看"（意符：这不只是文字）。 */
.v6-rmeta__withheld {
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  border-bottom: 1px dotted currentColor;
  opacity: 0.85;
}
.v6-rmeta__withheld:hover,
.v6-rmeta__withheld:focus-visible { opacity: 1; color: var(--dw-fg); }
.v6-rmeta__note {
  /* 父容器 .v6-rmeta 是 flex-wrap:wrap —— 不声明就变成指标行右侧的同行 item，
     既挤又会跟右侧动作钮抢位。占满一行宽度强制换行到下一行。 */
  flex: 1 0 100%;
  margin: 4px 0 0;
  padding: 6px 8px;
  border-radius: var(--dw-r2);
  background: var(--dw-sf2);
  color: var(--dw-mu);
  font-size: 11.5px;
  line-height: 1.55;
  max-width: 62ch;   /* 长句折行到易读宽度，而不是横铺满屏 */
}
@media (max-width: 768px) {
  /* 触摸目标：同 composer 的 44px 标准 */
  .v6-rmeta__withheld { min-height: 44px; display: inline-flex; align-items: center; }
}
.v6-rmeta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 8px;
  font-family: var(--dw-mono);
  font-size: 10.5px;
  color: var(--dw-mu);
  min-height: 22px;
}
.v6-rmeta__t { display: inline; }
.v6-rmeta__t span + span::before {
  content: '·';
  margin: 0 6px;
  opacity: 0.45;
}
/* 既有规则只认 span 兄弟；这个控件是 <button>（它要可点，语义上就该是按钮），
   于是紧贴在上一段后面变成「↑1.9k思考未公开」。精确补一条，不改上面那条以免波及
   compact 态的「详情」钮。 */
.v6-rmeta__t span + .v6-rmeta__withheld::before {
  content: '·';
  margin: 0 6px;
  opacity: 0.45;
}
.v6-rmeta__vol {
  opacity: 0.6;
  font-size: 8px;
  vertical-align: 3px;
  margin-left: 1px;
  font-style: normal;
}
.v6-rmeta__acts {
  display: none;
  gap: 2px;
  margin-left: 12px;
}
.v6-rmeta:hover .v6-rmeta__acts { display: flex; }
.v6-rmeta__acts button {
  padding: 2px 8px;
  border-radius: var(--dw-r);
  color: var(--dw-mu);
  font-size: 10.5px;
  font-family: var(--dw-font);
  border: 0;
  background: transparent;
  cursor: pointer;
}
.v6-rmeta__acts button:hover { background: var(--dw-sf2); color: var(--dw-fg); }

/* 窄屏「详情」开关 + 次级指标行 */
.v6-rmeta__more {
  margin-left: 8px;
  padding: 2px 8px;
  min-height: 24px;
  border: 1px solid var(--dw-bd);
  border-radius: 999px;
  background: transparent;
  color: var(--dw-mu);
  font-family: var(--dw-mono);
  font-size: 10px;
  cursor: pointer;
}
.v6-rmeta__more::before { content: none !important; }
.v6-rmeta__details {
  flex-basis: 100%;
  margin-top: 4px;
  opacity: 0.9;
}
.v6-rmeta__details span + span::before {
  content: '·';
  margin: 0 6px;
  opacity: 0.45;
}
</style>
