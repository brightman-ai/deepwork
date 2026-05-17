<script setup lang="ts">
import type { AssistantBlock } from '../types'

const props = defineProps<{
  block: Extract<AssistantBlock, { type: 'thinking' }>
  streaming?: boolean
}>()

function elapsedFrom(startedAt: number): string {
  return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`
}
</script>

<template>
  <details class="as-block as-block--thinking" :open="false" data-testid="assistant-thinking-block">
    <summary>
      <span class="as-block__icon">✦</span>
      <strong>{{ props.streaming ? '思考中' : '思考记录' }}</strong>
      <small v-if="props.block.runtime?.model">{{ props.block.runtime.model }}</small>
      <small v-if="props.block.startedAt">{{ elapsedFrom(props.block.startedAt) }}</small>
    </summary>
    <pre>{{ props.block.content }}</pre>
  </details>
</template>
