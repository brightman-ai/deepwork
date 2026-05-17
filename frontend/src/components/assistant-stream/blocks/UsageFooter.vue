<script setup lang="ts">
import type { AssistantMessage, AssistantUsageInfo } from '../types'

const props = defineProps<{
  message: AssistantMessage
  streaming?: boolean
}>()

function elapsedFrom(startedAt: number): string {
  return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`
}

function elapsedLabel(message: AssistantMessage, streaming: boolean): string {
  if (streaming && message.started_at_ms) return elapsedFrom(message.started_at_ms)
  if (!message.elapsed_ms) return ''
  return `${(message.elapsed_ms / 1000).toFixed(1)}s`
}

function tokenLabel(prefix: string, value?: number, estimated?: boolean): string {
  if (value === undefined || value < 0) return ''
  return `${prefix}${estimated ? '≈' : ' '}${Math.round(value).toLocaleString()}`
}

function usageParts(message: AssistantMessage, streaming: boolean): string[] {
  const usage: AssistantUsageInfo | undefined = message.live_usage ?? message.usage
  return [
    streaming ? '工作中' : '完成',
    elapsedLabel(message, streaming),
    tokenLabel('in', usage?.input_tokens, usage?.estimated),
    tokenLabel('think', usage?.thinking_tokens, usage?.estimated),
    tokenLabel('out', usage?.output_tokens, usage?.estimated),
    usage?.cost_usd !== undefined ? `$${usage.cost_usd.toFixed(4)}` : '',
  ].filter(Boolean)
}
</script>

<template>
  <div class="as-footer" data-testid="assistant-usage-footer">
    <span :class="['as-footer__dot', props.streaming ? 'as-footer__dot--active' : 'as-footer__dot--done']" />
    <span v-for="part in usageParts(props.message, props.streaming ?? false)" :key="part" class="as-footer__item">
      {{ part }}
    </span>
  </div>
</template>
