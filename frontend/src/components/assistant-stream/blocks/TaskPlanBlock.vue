<script setup lang="ts">
// CHG-014 D2: 重塑到原型 todoc 计划卡 (原型 1305-1310)。
// th 头 (☐ 计划 N/M + 进行中标注) → ti2 行 (g done/prog/pend ✓/◐/○ + 文本)。
import { computed } from 'vue'
import type { AssistantBlock } from '../types'

const props = defineProps<{
  block: Extract<AssistantBlock, { type: 'task-plan' }>
}>()

function glyph(status: string): string {
  if (status === 'completed') return '✓'
  if (status === 'in_progress') return '◐'
  return '○'
}
function gClass(status: string): string {
  if (status === 'completed') return 'v6-g--done'
  if (status === 'in_progress') return 'v6-g--prog'
  return 'v6-g--pend'
}

const doneCount = computed(() => props.block.tasks.filter(t => t.status === 'completed').length)
const inProgress = computed(() => props.block.tasks.find(t => t.status === 'in_progress'))
</script>

<template>
  <div class="v6-todoc" data-testid="assistant-task-plan">
    <div class="v6-todoc__h">
      <span>☐ 计划 {{ doneCount }}/{{ props.block.tasks.length }}</span>
      <span v-if="inProgress" class="v6-todoc__cur">进行中: {{ inProgress.content }}</span>
    </div>
    <div
      v-for="(task, i) in props.block.tasks.slice(0, 12)"
      :key="task.id ?? i"
      class="v6-ti2"
    >
      <span class="v6-g" :class="gClass(task.status)">{{ glyph(task.status) }}</span>
      <span :class="{ 'v6-ti2--done': task.status === 'completed' }">{{ task.content }}</span>
    </div>
  </div>
</template>

<style scoped>
.v6-todoc {
  border: 1px solid var(--dw-bd);
  border-radius: var(--dw-r2);
  background: var(--dw-sf);
  padding: 10px 13px;
  margin: 6px 0;
}
.v6-todoc__h {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 6px;
}
.v6-todoc__cur {
  font-family: var(--dw-mono);
  font-size: 11px;
  color: var(--dw-mu);
  font-weight: 400;
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.v6-ti2 {
  display: flex;
  gap: 8px;
  padding: 3px 0;
  font-size: 12px;
  align-items: center;
}
.v6-g {
  font-family: var(--dw-mono);
  width: 14px;
  text-align: center;
  font-size: 11px;
  flex-shrink: 0;
}
.v6-g--done { color: var(--dw-ok); }
.v6-g--prog { color: var(--dw-ac); }
.v6-g--pend { color: var(--dw-mu); }
.v6-ti2--done { color: var(--dw-mu); }
</style>
