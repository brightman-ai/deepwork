<script setup lang="ts">
// CHG-014 D2: 新增 live-head 运行头 (原型 1113/1327)。
// spin + 「正在执行 <cmd> — <note>」+ 计时。仅当前活跃轮渲染。
import type { AssistantBlock } from '../types'

const props = defineProps<{
  block: Extract<AssistantBlock, { type: 'live-head' }>
}>()
</script>

<template>
  <div class="v6-live-head" data-testid="assistant-live-head">
    <div class="v6-spin" />
    <span class="v6-live-head__lt">
      <template v-if="props.block.command">
        正在执行 <b class="v6-live-head__cmd">{{ props.block.command }}</b>
        <template v-if="props.block.note"> — {{ props.block.note }}</template>
      </template>
      <template v-else>{{ props.block.note || '运行中…' }}</template>
    </span>
    <span v-if="props.block.elapsed" class="v6-live-head__tm">{{ props.block.elapsed }}</span>
  </div>
</template>

<style scoped>
.v6-live-head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 12px;
  background: var(--dw-ac-dim);
  border: 1px solid var(--dw-ac-border-dim);
  border-radius: var(--dw-r2);
  margin: 4px 0 10px;
}
.v6-spin {
  width: 13px;
  height: 13px;
  border: 2px solid var(--dw-ac-border-dim);
  border-top-color: var(--dw-ac);
  border-radius: 50%;
  animation: v6-lh-spin 0.9s linear infinite;
  flex-shrink: 0;
}
.v6-live-head__lt {
  font-size: 12px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.v6-live-head__cmd { font-family: var(--dw-mono); font-size: 11px; }
.v6-live-head__tm {
  font-family: var(--dw-mono);
  font-size: 11px;
  color: var(--dw-ac);
  flex-shrink: 0;
}
@keyframes v6-lh-spin { to { transform: rotate(360deg); } }
</style>
