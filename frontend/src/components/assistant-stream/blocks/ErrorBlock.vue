<script setup lang="ts">
import { computed } from 'vue'
import type { AssistantBlock } from '../types'

const props = defineProps<{
  block: Extract<AssistantBlock, { type: 'error' }>
}>()

const emit = defineEmits<{
  retry: []
}>()

// 将原始错误信息转换为用户友好文案
function toFriendlyMessage(raw: string): string {
  if (!raw) return '发生未知错误，请稍后重试。'
  const lower = raw.toLowerCase()
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('timeout')) {
    return '网络连接失败，请检查网络后重试。'
  }
  if (lower.includes('unauthorized') || lower.includes('401') || lower.includes('forbidden') || lower.includes('403')) {
    return '认证失败，请检查 API Key 配置。'
  }
  if (lower.includes('rate limit') || lower.includes('429') || lower.includes('too many')) {
    return '请求频率超限，请稍后重试。'
  }
  if (lower.includes('context length') || lower.includes('token') || lower.includes('too long')) {
    return '输入内容过长，请缩短后重试。'
  }
  if (lower.includes('500') || lower.includes('server error') || lower.includes('internal')) {
    return '服务器内部错误，请稍后重试。'
  }
  // 如果原始信息看起来像 JSON，不直接展示
  if (raw.trimStart().startsWith('{') || raw.trimStart().startsWith('[')) {
    return '请求处理失败，请稍后重试。'
  }
  return raw
}

const friendlyMessage = computed(() => toFriendlyMessage(props.block.message))
</script>

<template>
  <div class="error-block" role="alert" aria-live="assertive">
    <span class="error-block__icon" aria-hidden="true">⚠</span>
    <span class="error-block__message">{{ friendlyMessage }}</span>
    <button
      v-if="block.retryable"
      type="button"
      class="error-block__retry"
      @click="emit('retry')"
    >
      重试
    </button>
  </div>
</template>

<style scoped>
/* CHG-014 V3-D: v6 tokenization — was hardcoded light red. --dw-red palette. */
.error-block {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--dw-red-dim);
  background: var(--dw-red-dim);
  color: var(--dw-red);
  font-size: 13px;
}

.error-block__icon {
  flex-shrink: 0;
  font-size: 14px;
  color: var(--dw-red);
}

.error-block__message {
  flex: 1;
  min-width: 0;
}

.error-block__retry {
  flex-shrink: 0;
  padding: 3px 10px;
  border-radius: 5px;
  border: 1px solid var(--dw-red-dim);
  background: var(--dw-sf2);
  color: var(--dw-red);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s;
}

.error-block__retry:hover {
  background: var(--dw-sf3);
}
</style>
