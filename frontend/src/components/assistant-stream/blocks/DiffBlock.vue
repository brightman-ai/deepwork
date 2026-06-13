<script setup lang="ts">
// CHG-014 D2: 新增 diff 块 (原型 1103/1223-1227)。
// dh 头 (文件路径) + dl 行 (add 绿 / del 红 / ctx 灰) + lno 行号栏。
import { computed } from 'vue'
import type { AssistantBlock } from '../types'

const props = defineProps<{
  block: Extract<AssistantBlock, { type: 'diff' }>
}>()

const stat = computed(() => {
  const add = props.block.lines.filter(l => l.kind === 'add').length
  const del = props.block.lines.filter(l => l.kind === 'del').length
  return { add, del }
})
function prefix(kind: string): string {
  if (kind === 'add') return '+'
  if (kind === 'del') return '-'
  return ' '
}
</script>

<template>
  <div class="v6-diff" data-testid="assistant-diff-block">
    <div class="v6-diff__dh">
      <span>{{ props.block.path }}</span>
      <span class="v6-diff__stat">+{{ stat.add }} −{{ stat.del }}</span>
    </div>
    <div
      v-for="(line, i) in props.block.lines"
      :key="i"
      class="v6-dl"
      :class="`v6-dl--${line.kind}`"
    >
      <span class="v6-lno">{{ line.lno ?? '' }}</span>{{ prefix(line.kind) }} {{ line.text }}
    </div>
  </div>
</template>

<style scoped>
.v6-diff {
  font-family: var(--dw-mono);
  font-size: 11px;
  line-height: 1.6;
  background: var(--dw-bg);
  border: 1px solid var(--dw-bd);
  border-radius: var(--dw-r2);
  overflow: hidden;
  margin: 8px 0;
}
.v6-diff__dh {
  padding: 5px 10px;
  background: var(--dw-sf2);
  color: var(--dw-mu);
  font-size: 10px;
  border-bottom: 1px solid var(--dw-bd);
  display: flex;
  gap: 8px;
}
.v6-diff__stat { margin-left: auto; }
.v6-dl {
  padding: 1px 10px;
  white-space: pre;
}
.v6-dl--add { background: var(--dw-ok-surface-dim); color: var(--dw-ok); }
.v6-dl--del { background: var(--dw-red-surface-dim); color: var(--dw-red); }
.v6-dl--ctx { color: var(--dw-mu); }
.v6-lno {
  display: inline-block;
  width: 26px;
  color: var(--dw-mu);
  opacity: 0.5;
  user-select: none;
  font-size: 10px;
}
</style>
