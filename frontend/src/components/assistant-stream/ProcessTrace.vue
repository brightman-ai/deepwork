<script lang="ts">
let traceSeq = 0
</script>

<script setup lang="ts">
// ProcessTrace：一次 AgentRun 的过程容器 —— 可逆披露。
//
// 运行中默认展开并持续生长（标题「正在处理 · Ns」，活计时）；完成后可收成一行
// 「已处理 · XmYs」，最终答案在容器**外**照常可见；点击展开 = 原时序完整恢复
// （段的 id/数量/顺序/内容全不变——折叠只是可见性状态，绝不是内容合并）。
//
// 段一律经**同一个 blockRegistry** 渲染（ThinkingBlock / ToolGroupBlock / AgentBlock /
// PermissionBlock / ErrorBlock…），零复制、零 provider 分支。
import { computed, onUnmounted, ref, watch } from 'vue'
import type { AssistantBlock } from './types'
import { blockRegistry } from './blockRegistry'
import { formatRunDuration } from './runSplit'
import {
  PROCESS_TRACE_PAGING_THRESHOLD,
  earlierSegmentWindowStart,
  latestSegmentWindowStart,
  newerSegmentWindowStart,
  segmentWindow,
} from './segmentWindow'

const props = defineProps<{
  segments: AssistantBlock[]
  /** 本轮仍在跑 → 展开生长 + 活计时。 */
  streaming?: boolean
  /** 需要人处理（审批/错误/等待）→ 强制展开，且不允许自动收口。 */
  attention?: boolean
  /** 完成态总耗时（ms）。缺失 → 标题不编造时长（显示「已处理」而非假 0s）。 */
  elapsedMs?: number
  /**
   * F5 (ws-live-session r6 post-fix): 本轮真实终态是 failed/canceled（message.status
   * ==='failed'，落库 status 的镜像，不是"有没有结束"）。「已处理」隐含"顺利处理完毕"，
   * 与紧邻的错误块/终态提示（如「本轮已取消，未生成可恢复的回答」）同框会自相矛盾——
   * Witness 原话"两个状态同时挂着自相矛盾"。缺省 false/未传 → 行为不变（仍显「已处理」）。
   */
  failed?: boolean
  /** 运行态起点（ms）。用于活计时。 */
  startedAtMs?: number
  /**
   * 用户是否仍跟在流尾。false = 他上滑在读历史 → 本轮完成时**不**自动收口
   * （不抢走正在读的上下文；设计心理学：不制造布局突变）。
   */
  follow?: boolean
  actionable?: boolean
}>()

const emit = defineEmits<{ (e: 'block-action', payload: { action: string; block: AssistantBlock }): void }>()

// expansion intent：auto = 跟随状态机；manual-* = 用户已表态，机器不得覆盖。
type Intent = 'auto' | 'manual-open' | 'manual-collapsed'
const intent = ref<Intent>('auto')

const open = computed<boolean>(() => {
  if (props.attention) return true // attention 穿透一切折叠（含 manual-collapsed）
  if (intent.value === 'manual-open') return true
  if (intent.value === 'manual-collapsed') return false
  return !!props.streaming // auto: 跑着就展开，完成即收口
})

function toggle(): void {
  intent.value = open.value ? 'manual-collapsed' : 'manual-open'
}

// 完成瞬间：仅 auto 且用户仍跟在流尾时才自动收口。否则把当前展开态**固化**为用户意图，
// 免得他正读着过程、run 一结束内容就在眼皮底下塌掉。
watch(
  () => props.streaming,
  (now, before) => {
    if (before && !now && intent.value === 'auto' && props.follow === false) {
      intent.value = 'manual-open'
    }
  },
)

// 活计时：运行中 200ms 推进（与 ThinkingBlock 同口径）。完成后走冻结的 elapsedMs，
// 永不继续增长。两者都拿不到 → 不显示时长（诚实 —— 不伪造 0s）。
const nowTick = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null
watch(
  () => props.streaming,
  (s) => {
    if (s && !timer) {
      timer = setInterval(() => { nowTick.value = Date.now() }, 200)
    } else if (!s && timer) {
      clearInterval(timer)
      timer = null
    }
  },
  { immediate: true },
)
onUnmounted(() => { if (timer) clearInterval(timer) })

const duration = computed<string>(() => {
  if (props.streaming) {
    if (props.startedAtMs === undefined) return ''
    return formatRunDuration(Math.max(0, nowTick.value - props.startedAtMs))
  }
  return formatRunDuration(props.elapsedMs)
})

// 运行态与完成态语义必须一致：跑着的时候绝不写「已处理」。
// F5: 完成态里 failed/canceled 也不能写「已处理」——那是"顺利处理完毕"的暗示，与紧邻的
// 错误块/终态提示同框自相矛盾。「未完成」诚实中性：不认领成功，也不撞车下方已经给出的
// 具体原因（已取消/执行失败/…）。permission/waiting 触发的「待处理」不受影响（那是"AI
// 这段处理完了、轮到人了"，与「已处理」并不矛盾，见 runSplit.ts ATTENTION_KINDS）。
const title = computed(() => {
  if (props.streaming) return '正在处理'
  if (props.failed) return '未完成'
  return '已处理'
})

// 收起时的一行摘要：给个「里面有什么」的意符（不是替代过程的生成式摘要）。
const summary = computed(() => {
  let tools = 0
  let agents = 0
  let thinking = 0
  for (const b of props.segments) {
    if (b.type === 'tool-group') tools += ((b as { tools?: unknown[] }).tools?.length ?? 0)
    else if (b.type === 'agent') agents++
    else if (b.type === 'thinking') thinking++
  }
  const parts: string[] = []
  if (tools) parts.push(`${tools} 次工具`)
  if (agents) parts.push(`${agents} 个子 agent`)
  if (thinking && !parts.length) parts.push('思考')
  return parts.join(' · ')
})

const bodyId = `as-trace-body-${++traceSeq}`

// A giant run is one domain fact, not one DOM commit. Keep the complete `segments`
// array untouched and project at most 100 adjacent entries. The initial page is the
// latest one because it contains the action currently running / the run's conclusion.
const segmentWindowStart = ref(latestSegmentWindowStart(props.segments.length))
const followingLatestSegments = ref(true)
const pagedSegments = computed(() => props.segments.length > PROCESS_TRACE_PAGING_THRESHOLD)
const currentSegmentWindow = computed(() =>
  segmentWindow(props.segments.length, segmentWindowStart.value),
)
const visibleSegments = computed(() => {
  const window = currentSegmentWindow.value
  return props.segments.slice(window.start, window.end).map((block, offset) => ({
    block,
    index: window.start + offset,
  }))
})
const segmentWindowLabel = computed(() => {
  const window = currentSegmentWindow.value
  return `第 ${window.start + 1}–${window.end} 段 · 共 ${window.total}`
})
const hasEarlierSegments = computed(() => currentSegmentWindow.value.start > 0)
const hasNewerSegments = computed(() => currentSegmentWindow.value.end < props.segments.length)

watch(
  () => props.segments.length,
  (total) => {
    if (total <= PROCESS_TRACE_PAGING_THRESHOLD) {
      segmentWindowStart.value = 0
      followingLatestSegments.value = true
      return
    }
    if (followingLatestSegments.value) {
      segmentWindowStart.value = latestSegmentWindowStart(total)
    } else {
      segmentWindowStart.value = segmentWindow(total, segmentWindowStart.value).start
    }
  },
)

function showEarlierSegments(): void {
  followingLatestSegments.value = false
  segmentWindowStart.value = earlierSegmentWindowStart(currentSegmentWindow.value.start)
}
function showNewerSegments(): void {
  const next = newerSegmentWindowStart(props.segments.length, currentSegmentWindow.value.start)
  segmentWindowStart.value = next
  followingLatestSegments.value = next === latestSegmentWindowStart(props.segments.length)
}
function showLatestSegments(): void {
  followingLatestSegments.value = true
  segmentWindowStart.value = latestSegmentWindowStart(props.segments.length)
}

function resolveBlock(type: string) {
  return blockRegistry.resolve(type) ?? null
}
// 阶段叙述文本（开放 union → 模板拿不到窄化，helper 里取）。
function narrationOf(block: AssistantBlock): string {
  const c = (block as { content?: unknown }).content
  return typeof c === 'string' ? c : ''
}
function handlers(block: AssistantBlock) {
  const fire = (action: string) => () => emit('block-action', { action, block })
  return {
    open: fire('open'), export: fire('export'), goto: fire('goto'), expand: fire('expand'),
    'allow-once': fire('allow-once'), 'allow-always': fire('allow-always'), deny: fire('deny'),
    copy: fire('copy'), retry: fire('retry'),
  }
}
</script>

<template>
  <div
    class="as-trace"
    :class="{ 'as-trace--open': open, 'as-trace--attention': attention }"
    data-testid="assistant-process-trace"
    :data-open="open"
    :data-segments="segments.length"
  >
    <button
      type="button"
      class="as-trace__head"
      :aria-expanded="open"
      :aria-controls="bodyId"
      data-testid="assistant-process-trace-toggle"
      @click="toggle"
    >
      <span class="as-trace__title">
        <span v-if="streaming" class="as-trace__pulse" aria-hidden="true" />
        {{ title }}
      </span>
      <span v-if="duration" class="as-trace__dur">{{ duration }}</span>
      <span v-if="!open && summary" class="as-trace__sum">{{ summary }}</span>
      <span v-if="attention" class="as-trace__attn">待处理</span>
      <span class="as-trace__chev" aria-hidden="true">▶</span>
    </button>

    <div v-if="open" :id="bodyId" class="as-trace__body">
      <nav v-if="pagedSegments" class="as-trace__pages" aria-label="过程段导航">
        <button type="button" :disabled="!hasEarlierSegments" @click.stop="showEarlierSegments">← 更早</button>
        <span aria-live="polite">{{ segmentWindowLabel }}</span>
        <button type="button" :disabled="!hasNewerSegments" @click.stop="showNewerSegments">较新 →</button>
        <button v-if="hasNewerSegments" type="button" @click.stop="showLatestSegments">最新</button>
      </nav>
      <template v-for="entry in visibleSegments" :key="`seg-${entry.index}`">
        <template v-if="entry.block.type === 'text'">
          <div class="as-trace__narration">{{ narrationOf(entry.block) }}</div>
        </template>
        <component
          :is="resolveBlock(entry.block.type)"
          v-else-if="resolveBlock(entry.block.type)"
          :block="entry.block"
          :streaming="streaming && entry.index === segments.length - 1"
          :actionable="actionable"
          v-on="handlers(entry.block)"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
/* 与 ThinkingBlock / ToolGroupBlock 同一视觉语汇（v6 sbl/bh/chev），但作为「整轮过程」
   的外层容器：更轻的边框 + 顶部细分隔线，收起时就是一行 44px 的披露条。 */
.as-trace {
  border-top: 1px solid var(--dw-bd);
  margin: 2px 0 4px;
}
.as-trace__head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 34px;
  padding: 6px 2px;
  border: 0;
  background: transparent;
  color: var(--dw-mu);
  font: inherit;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
}
.as-trace__head:hover { color: var(--dw-fg); }
.as-trace__head:focus-visible {
  outline: 2px solid var(--dw-ac);
  outline-offset: -2px;
  border-radius: var(--dw-r2, 6px);
}
.as-trace__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  flex-shrink: 0;
}
.as-trace__dur {
  font-family: var(--dw-mono);
  font-size: 11.5px;
  flex-shrink: 0;
}
.as-trace__sum {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  opacity: 0.8;
}
.as-trace__attn {
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--dw-warn-dim, var(--dw-ac-dim));
  color: var(--dw-warn, var(--dw-ac));
  font-size: 10px;
  font-weight: 600;
  flex-shrink: 0;
}
.as-trace__chev {
  margin-left: auto;
  font-size: 9px;
  flex-shrink: 0;
  transition: transform 0.15s;
}
.as-trace--open .as-trace__chev { transform: rotate(90deg); }
/* 运行态脉冲：状态有生命力（完成即停）。 */
.as-trace__pulse {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dw-ac);
  animation: as-trace-pulse 1.2s ease-in-out infinite;
}
@keyframes as-trace-pulse {
  0%, 100% { opacity: 0.5; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1.1); }
}
@media (prefers-reduced-motion: reduce) {
  .as-trace__pulse { animation: none; }
  .as-trace__chev { transition: none; }
}
.as-trace__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 2px 0 8px 10px;
  border-left: 2px solid var(--dw-bd);
  margin-left: 3px;
}
.as-trace__pages {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  color: var(--dw-mu);
  font-family: var(--dw-mono);
  font-size: 10.5px;
}
.as-trace__pages span { margin-right: auto; }
.as-trace__pages button {
  min-height: 28px;
  padding: 3px 7px;
  border: 1px solid var(--dw-bd);
  border-radius: 5px;
  background: var(--dw-sf2);
  color: var(--dw-mu);
  font: inherit;
  cursor: pointer;
}
.as-trace__pages button:hover:not(:disabled) { border-color: var(--dw-ac); color: var(--dw-fg); }
.as-trace__pages button:disabled { opacity: 0.35; cursor: default; }
/* 展开时，过程与它下面的最终答复之间要有明确断点（否则两段文字连成一片）。 */
.as-trace--open {
  padding-bottom: 4px;
  border-bottom: 1px solid var(--dw-bd);
  margin-bottom: 8px;
}
/* 过程里的阶段叙述：可扫读，但**必须次于最终答复**。独立见证者反馈：展开后叙述与答复
   同字号同颜色 → 分不清哪句是结论。所以叙述压到 12.5px/muted 色，答复保持 13.5px/前景色，
   并在容器底部留一条分隔线 —— 视觉层级 = 语义层级。 */
.as-trace__narration {
  font-size: 12.5px;
  line-height: 1.58;
  color: var(--dw-mu);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
/* 移动：披露条 44px 触摸目标。 */
@media (max-width: 768px) {
  .as-trace__head { min-height: 44px; }
  .as-trace__sum { display: none; }
  .as-trace__pages { flex-wrap: wrap; }
  .as-trace__pages button { min-height: 44px; }
}
</style>
