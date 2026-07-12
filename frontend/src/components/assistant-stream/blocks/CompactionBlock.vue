<script setup lang="ts">
// 上下文自动压缩 —— runtime 系统事件（codex `context_compacted`）。
// 它是这一轮因果链的一环（"从这里开始它看不到更早的上下文了"），所以必须能在展开的
// ProcessTrace 里被看见；但它不是对话轮，也不该抢视觉。紧凑单行灰条即可。
import type { AssistantBlock } from '../types'

const props = defineProps<{ block: Extract<AssistantBlock, { type: 'compaction' }> }>()
</script>

<template>
  <div class="as-compact" data-testid="assistant-compaction-block">
    <span class="as-compact__icon" aria-hidden="true">⇥</span>
    <span class="as-compact__text">{{ props.block.text || '上下文已自动压缩' }}</span>
  </div>
</template>

<style scoped>
.as-compact {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 2px;
  color: var(--dw-mu);
  font-size: 11.5px;
}
.as-compact__icon {
  font-family: var(--dw-mono);
  opacity: 0.8;
  flex-shrink: 0;
}
.as-compact__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
