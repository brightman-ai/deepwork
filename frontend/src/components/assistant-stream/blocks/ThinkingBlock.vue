<script lang="ts">
// 模块级唯一 id 计数（非 setup，全组件实例共享递增）。
let thinkSeq = 0
</script>

<script setup lang="ts">
// CHG-014 D2: 重塑到原型 sbl.think 质感 (chip ch-think + bprev + 卷收)。
// 原型行 1090 / CSS .chip.ch-think + .bprev + .sbl 卷收 (open class)。
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { AssistantBlock } from '../types'
import { thinkingPresentation } from '../thinkingPresentation'

const props = defineProps<{
  block: Extract<AssistantBlock, { type: 'thinking' }>
  streaming?: boolean
}>()

// 流式 thinking 默认展开，思考结束后自动折叠。只投影状态、耗时和安全说明；原始
// chain-of-thought 是模型草稿，不进入 DOM。工具调用与结果继续由 ProcessTrace 完整披露。
const manual = ref<boolean | null>(null)
const open = computed<boolean>(() => (manual.value !== null ? manual.value : !!props.block.streaming))
function toggle(): void {
  manual.value = !open.value
}
// F8 a11y: aria-controls 需指向 body 唯一 id（折叠头 ↔ 内容关联）。模块级自增计数。
const bodyId = `as-think-body-${++thinkSeq}`

// CHG-015 P3a: 思考耗时显示。优先用「冻结时长」= endedAt-startedAt（reducer 在思考结束
// 即 text 开始 / turn done 时戳 endedAt），与后端 total elapsed 同口径（块时长，不含等待空转）
// → 流结束后不再增长、永不大于 total。仅当仍在流式且未冻结时退化为 wall-clock（真在跳动）。
const thinkElapsed = computed<string | null>(() => {
  const b = props.block
  if (b.startedAt === undefined) return null
  const end = b.endedAt ?? (b.streaming ? nowTick.value : undefined)
  if (end === undefined) return null
  return `${(Math.max(0, end - b.startedAt) / 1000).toFixed(1)}s`
})

// 流式期间每 200ms 推进一次 wall-clock（仅未冻结时有意义）。冻结后 endedAt 固定 → computed
// 不再依赖 nowTick 变化亦稳定。组件卸载清理定时器。
const nowTick = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  if (props.block.streaming && props.block.endedAt === undefined) {
    timer = setInterval(() => { nowTick.value = Date.now() }, 200)
  }
})
watch(() => props.block.streaming, (s) => {
  if (!s && timer) { clearInterval(timer); timer = null }
})
onUnmounted(() => { if (timer) clearInterval(timer) })

const presentation = computed(() => thinkingPresentation(!!props.block.streaming))
</script>

<template>
  <div
    class="v6-sbl v6-sbl--think"
    :class="{ 'v6-sbl--open': open }"
    data-testid="assistant-thinking-block"
  >
    <button
      type="button"
      class="v6-bh"
      :aria-expanded="open"
      :aria-controls="bodyId"
      @click="toggle"
    >
      <span
        class="v6-chip v6-chip--think"
        :class="{ 'v6-chip--live': props.block.streaming }"
      >{{ presentation.label }}</span>
      <span class="v6-bprev">{{ presentation.summary }}</span>
      <small v-if="props.block.runtime?.model" class="v6-bh__model">{{ props.block.runtime.model }}</small>
      <small v-if="thinkElapsed" class="v6-bh__tm">{{ thinkElapsed }}</small>
      <span class="v6-bchev">▶</span>
    </button>
    <div v-if="open" :id="bodyId" class="v6-bb">
      <p>{{ presentation.disclosure }}</p>
    </div>
  </div>
</template>

<style scoped>
.v6-sbl {
  border: 1px solid var(--dw-bd);
  background: var(--dw-sf);
  border-radius: var(--dw-r2);
  overflow: hidden;
  margin: 4px 0;
}
.v6-bh {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  cursor: pointer;
  border: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  text-align: left;
}
.v6-bh:hover { background: var(--dw-sf2); }
.v6-bh:focus-visible {
  outline: 2px solid var(--dw-ac);
  outline-offset: -2px;
}
.v6-chip {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 3px;
  font-family: var(--dw-mono);
  font-size: 10px;
  font-weight: 500;
  border: 1px solid var(--dw-bd);
  white-space: nowrap;
  flex-shrink: 0;
}
.v6-chip--think {
  color: var(--dw-ac);
  background: var(--dw-ac-dim);
  font-size: 9px;
}
/* WS1: 流式思考时 chip 呼吸 — 表明「正在思考」有生命力。 */
.v6-chip--live {
  animation: v6-think-breathe 1.4s ease-in-out infinite;
}
@keyframes v6-think-breathe {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
@media (prefers-reduced-motion: reduce) {
  .v6-chip--live { animation: none; }
}
.v6-bprev {
  font-size: 11px;
  color: var(--dw-mu);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  font-style: italic;
}
.v6-bh__model,
.v6-bh__tm {
  font-family: var(--dw-mono);
  font-size: 10px;
  color: var(--dw-mu);
  flex-shrink: 0;
}
.v6-bchev {
  font-size: 9px;
  color: var(--dw-mu);
  flex-shrink: 0;
  transition: transform 0.15s;
}
.v6-sbl--open .v6-bchev { transform: rotate(90deg); }
.v6-bb {
  border-top: 1px solid var(--dw-bd);
}
.v6-bb p {
  margin: 0;
  padding: 8px 10px 10px;
  color: var(--dw-mu);
  font-size: 12px;
  line-height: 1.6;
}
</style>
