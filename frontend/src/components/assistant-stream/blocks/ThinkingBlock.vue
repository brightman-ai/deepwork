<script lang="ts">
// 模块级唯一 id 计数（非 setup，全组件实例共享递增）。
let thinkSeq = 0
</script>

<script setup lang="ts">
// CHG-014 D2: 重塑到原型 sbl.think 质感 (chip ch-think + bprev + 卷收)。
// 原型行 1090 / CSS .chip.ch-think + .bprev + .sbl 卷收 (open class)。
import { computed, ref } from 'vue'
import type { AssistantBlock } from '../types'

const props = defineProps<{
  block: Extract<AssistantBlock, { type: 'thinking' }>
  streaming?: boolean
}>()

// 流式 thinking 默认展开（逐字可见的 live 思考），思考结束（block.streaming=false，由
// reducer 在 text 开始 / done 时翻转）自动折叠为 chip+预览（转录整洁）。用户点击 = 显式
// pin，覆盖自动默认。这是「过程 thinking 有效呈现」的关键修复：此前 ref(false) 默认折叠，
// 流式思考内容藏在折叠体里，用户只看到状态空转 → 误判「无流式」。
const manual = ref<boolean | null>(null)
const open = computed<boolean>(() => (manual.value !== null ? manual.value : !!props.block.streaming))
function toggle(): void {
  manual.value = !open.value
}
// F8 a11y: aria-controls 需指向 body 唯一 id（折叠头 ↔ 内容关联）。模块级自增计数。
const bodyId = `as-think-body-${++thinkSeq}`

function elapsedFrom(startedAt: number): string {
  return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`
}

// 折叠时的单行预览 (首行/截断)
const preview = computed(() => {
  const raw = (props.block.content || '').trim().replace(/\s+/g, ' ')
  return raw.slice(0, 120)
})
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
      >{{ props.block.streaming ? '思考中' : 'Thinking' }}</span>
      <span class="v6-bprev">{{ preview }}</span>
      <small v-if="props.block.runtime?.model" class="v6-bh__model">{{ props.block.runtime.model }}</small>
      <small v-if="props.block.startedAt" class="v6-bh__tm">{{ elapsedFrom(props.block.startedAt) }}</small>
      <span class="v6-bchev">▶</span>
    </button>
    <div v-if="open" :id="bodyId" class="v6-bb">
      <pre>{{ props.block.content
        }}<span v-if="props.block.streaming" class="v6-think-caret" aria-hidden="true" /></pre>
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
/* WS1: 逐 token 追加末尾打字态光标。Vue 对 block.content 的 delta 增量已自动重渲染
   <pre>，此光标提供「正在写入」视觉锚点。 */
.v6-think-caret {
  display: inline-block;
  width: 6px;
  height: 1em;
  margin-left: 1px;
  vertical-align: text-bottom;
  background: var(--dw-ac);
  border-radius: 1px;
  animation: v6-think-caret-blink 1s steps(2, start) infinite;
}
@keyframes v6-think-caret-blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .v6-chip--live { animation: none; }
  .v6-think-caret { animation: none; opacity: 0.7; }
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
.v6-bb pre {
  margin: 0;
  padding: 8px 10px 10px;
  white-space: pre-wrap;
  color: var(--dw-mu);
  font-size: 12px;
  font-family: var(--dw-mono);
}
</style>
