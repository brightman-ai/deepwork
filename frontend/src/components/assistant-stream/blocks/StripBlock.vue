<script setup lang="ts">
// CHG-014 D2: 新增 strip 卷收条 (原型 1088)。折叠的历史轮摘要。
// ✓N 步 + 摘要 + 耗时 · 展开 ▸。点击触发展开回调 (装配方决定恢复哪段)。
import type { AssistantBlock } from '../types'

const props = withDefaults(defineProps<{
  block: Extract<AssistantBlock, { type: 'strip' }>
  // F2: 消费点未接 expand → 静态展示，不渲染为可点。
  actionable?: boolean
}>(), {
  actionable: true,
})

const emit = defineEmits<{ (e: 'expand'): void }>()
</script>

<template>
  <!-- F8 a11y: 可展开时用原生 button（自带 Enter/Space + focus）；否则静态 div。 -->
  <button
    v-if="props.actionable"
    type="button"
    class="v6-strip"
    data-testid="assistant-strip-block"
    @click="emit('expand')"
  >
    <span class="v6-strip__n">✓ {{ props.block.steps }} 步</span>
    <span v-if="props.block.range" class="v6-strip__rng">{{ props.block.range }}</span>
    <span class="v6-strip__sum">{{ props.block.summary }}</span>
    <span class="v6-strip__grow" />
    <span class="v6-strip__meta">{{ props.block.duration || '—' }} · 展开 ▸</span>
  </button>
  <div v-else class="v6-strip v6-strip--static" data-testid="assistant-strip-block">
    <span class="v6-strip__n">✓ {{ props.block.steps }} 步</span>
    <span v-if="props.block.range" class="v6-strip__rng">{{ props.block.range }}</span>
    <span class="v6-strip__sum">{{ props.block.summary }}</span>
    <span class="v6-strip__grow" />
    <span class="v6-strip__meta">{{ props.block.duration || '—' }}</span>
  </div>
</template>

<style scoped>
.v6-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  font: inherit;
  padding: 7px 12px;
  background: var(--dw-sf);
  border: 1px solid var(--dw-bd);
  border-radius: var(--dw-r2);
  margin: 4px 0 8px;
  cursor: pointer;
  color: var(--dw-mu);
  font-size: 12px;
}
.v6-strip--static { cursor: default; }
button.v6-strip:hover { border-color: var(--dw-mu); }
button.v6-strip:focus-visible {
  outline: 2px solid var(--dw-ac);
  outline-offset: 1px;
}
.v6-strip__n {
  color: var(--dw-ok);
  font-family: var(--dw-mono);
  font-size: 11px;
  flex-shrink: 0;
}
.v6-strip__rng {
  font-family: var(--dw-mono);
  font-size: 10px;
  opacity: 0.7;
  flex-shrink: 0;
}
.v6-strip__sum {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.v6-strip__grow { flex: 1; }
.v6-strip__meta {
  font-family: var(--dw-mono);
  font-size: 11px;
  flex-shrink: 0;
}
</style>
