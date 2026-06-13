<script setup lang="ts">
// CHG-014 D2/J3: 新增 qbanner 问题横幅 (原型 1298/1326, OD 特有)。
// 未答 → 琥珀蓝边可点 (→ 右栏问题 tab)；已答 → 灰静默不可点。
import { computed } from 'vue'
import type { AssistantBlock } from '../types'

const props = withDefaults(defineProps<{
  block: Extract<AssistantBlock, { type: 'qbanner' }>
  // F2: 消费点未接 goto → 静默展示，不渲染为可点（避免可点但无效）。
  actionable?: boolean
}>(), {
  actionable: true,
})

const emit = defineEmits<{ (e: 'goto'): void }>()

// 仅「未答 + 接线」才可点；其余渲染为静态 div（F2/F8 a11y：可点用原生 button）。
const interactive = computed(() => !props.block.answered && props.actionable)
</script>

<template>
  <button
    v-if="interactive"
    type="button"
    class="v6-qbanner"
    data-testid="assistant-qbanner"
    @click="emit('goto')"
  >
    <span class="v6-qbanner__mark">？</span>
    <span class="v6-qbanner__txt">{{ props.block.text }}</span>
    <b class="v6-qbanner__go">前往右栏 →</b>
  </button>
  <div
    v-else
    class="v6-qbanner"
    :class="{ 'v6-qbanner--done': props.block.answered }"
    data-testid="assistant-qbanner"
  >
    <span class="v6-qbanner__mark">{{ props.block.answered ? '✓' : '？' }}</span>
    <span class="v6-qbanner__txt">{{ props.block.text }}</span>
  </div>
</template>

<style scoped>
.v6-qbanner {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  font: inherit;
  color: inherit;
  padding: 9px 12px;
  border: 1px solid var(--dw-blu-border-dim);
  background: var(--dw-blu-dim);
  border-radius: var(--dw-r2);
  margin: 6px 0;
  cursor: pointer;
  font-size: 12px;
}
button.v6-qbanner:focus-visible {
  outline: 2px solid var(--dw-blu);
  outline-offset: 1px;
}
.v6-qbanner:hover { border-color: var(--dw-blu); }
.v6-qbanner--done {
  border-color: var(--dw-bd);
  background: var(--dw-sf);
  color: var(--dw-mu);
  cursor: default;
}
.v6-qbanner__mark { flex-shrink: 0; }
.v6-qbanner__txt {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.v6-qbanner__go { margin-left: auto; flex-shrink: 0; }
</style>
