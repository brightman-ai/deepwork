<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import PaneShell from './PaneShell.vue'
import type { PaneShellProps } from './PaneShell.vue'

interface CanvasPaneProps {
  mode?: 'interactive' | 'readonly'
  aspectRatio?: string
  showToolbar?: boolean
  loading?: boolean
  emptyState?: PaneShellProps['emptyState']
  title?: string
}

const props = withDefaults(defineProps<CanvasPaneProps>(), {
  mode: 'readonly',
  showToolbar: true,
  loading: false,
})

const emit = defineEmits<{
  'escape': []
}>()

defineSlots<{
  'header-actions'(): any
  toolbar(): any
  default(): any
  empty(): any
}>()

const canvasEl = ref<HTMLElement | null>(null)
const isInteracting = ref(false)

function onKeyDown(e: KeyboardEvent) {
  if (props.mode !== 'interactive') return
  if (e.key === 'Escape') {
    isInteracting.value = false
    emit('escape')
    canvasEl.value?.blur()
  }
}

function onFocus() {
  if (props.mode === 'interactive') {
    isInteracting.value = true
  }
}

function onBlur() {
  isInteracting.value = false
}

onMounted(() => {
  canvasEl.value?.addEventListener('keydown', onKeyDown)
  canvasEl.value?.addEventListener('focus', onFocus)
  canvasEl.value?.addEventListener('blur', onBlur)
})

onUnmounted(() => {
  canvasEl.value?.removeEventListener('keydown', onKeyDown)
  canvasEl.value?.removeEventListener('focus', onFocus)
  canvasEl.value?.removeEventListener('blur', onBlur)
})
</script>

<template>
  <PaneShell
    :title="title"
    :empty-state="emptyState"
    class="flex-1"
  >
    <template v-if="$slots['header-actions']" #header-actions>
      <slot name="header-actions" />
    </template>

    <template #empty>
      <slot name="empty" />
    </template>

    <div
      ref="canvasEl"
      class="flex flex-col flex-1 overflow-hidden"
      :tabindex="mode === 'interactive' ? 0 : -1"
      :class="{
        'ring-2 ring-primary ring-inset': isInteracting,
        'cursor-default': mode === 'readonly',
      }"
    >
      <!-- Toolbar -->
      <div
        v-if="showToolbar && $slots.toolbar"
        class="shrink-0 flex items-center gap-1 px-2 py-1 border-b border-border bg-muted/30"
      >
        <slot name="toolbar" />
      </div>

      <!-- Content area -->
      <div
        class="flex-1 overflow-hidden relative"
        :style="aspectRatio ? { aspectRatio } : {}"
      >
        <div v-if="loading" class="flex items-center justify-center h-full">
          <span class="text-xs text-muted-foreground animate-pulse">Loading...</span>
        </div>
        <slot v-else />
      </div>

      <!-- Interactive mode hint -->
      <div
        v-if="mode === 'interactive' && !isInteracting"
        class="absolute inset-0 flex items-center justify-center pointer-events-none"
      >
        <span class="text-xs text-muted-foreground bg-background/70 px-2 py-1 rounded">
          Click to interact · Esc to release
        </span>
      </div>
    </div>
  </PaneShell>
</template>
