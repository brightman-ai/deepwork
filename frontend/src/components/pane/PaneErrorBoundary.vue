<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'

const error = ref<Error | null>(null)
const info = ref<string>('')

onErrorCaptured((err, instance, errorInfo) => {
  error.value = err instanceof Error ? err : new Error(String(err))
  info.value = errorInfo ?? ''
  console.error('[PaneErrorBoundary] render error:', err, '\ncomponent:', instance, '\ninfo:', errorInfo)
  return false // stop propagation
})

function retry() {
  error.value = null
  info.value = ''
}
</script>

<template>
  <div v-if="error" class="pane-error-boundary">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
    <span class="pane-error-boundary__msg">{{ error.message || '渲染错误' }}</span>
    <button class="pane-error-boundary__retry" @click="retry">重试</button>
  </div>
  <slot v-else />
</template>

<style scoped>
.pane-error-boundary {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  width: 100%;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
  padding: 16px;
  text-align: center;
}

.pane-error-boundary__msg {
  max-width: 240px;
  word-break: break-word;
  opacity: 0.75;
}

.pane-error-boundary__retry {
  margin-top: 4px;
  padding: 3px 10px;
  border-radius: 4px;
  border: 1px solid hsl(var(--border));
  background: transparent;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  cursor: pointer;
}
.pane-error-boundary__retry:hover {
  background: hsl(var(--muted) / 0.5);
}
</style>
