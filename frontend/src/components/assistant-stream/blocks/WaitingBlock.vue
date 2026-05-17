<script setup lang="ts">
import type { AssistantBlock } from '../types'

const props = defineProps<{
  block: Extract<AssistantBlock, { type: 'waiting' }>
}>()

function elapsedFrom(startedAt: number): string {
  return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`
}
</script>

<template>
  <div class="as-block as-block--waiting" data-testid="assistant-waiting-block">
    <span class="as-spinner" />
    <span>{{ props.block.status || '生成中' }}</span>
    <small v-if="props.block.startedAt">{{ elapsedFrom(props.block.startedAt) }}</small>
  </div>
</template>
