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

const open = ref(false)
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
      @click="open = !open"
    >
      <span class="v6-chip v6-chip--think">{{ props.streaming ? '思考中' : 'Thinking' }}</span>
      <span class="v6-bprev">{{ preview }}</span>
      <small v-if="props.block.runtime?.model" class="v6-bh__model">{{ props.block.runtime.model }}</small>
      <small v-if="props.block.startedAt" class="v6-bh__tm">{{ elapsedFrom(props.block.startedAt) }}</small>
      <span class="v6-bchev">▶</span>
    </button>
    <div v-if="open" :id="bodyId" class="v6-bb">
      <pre>{{ props.block.content }}</pre>
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
