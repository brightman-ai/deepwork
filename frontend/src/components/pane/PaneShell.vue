<script setup lang="ts">
import type { Component } from 'vue'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Collapsible, CollapsibleContent } from '@ce/components/ui/collapsible'
import { ChevronRight } from 'lucide-vue-next'

export interface EmptyState {
  level: 'guide' | 'operational' | 'compact' | 'error'
  title: string
  description?: string
  icon?: Component
  primaryAction?: { label: string }
}

export interface PaneShellProps {
  title?: string
  collapsible?: boolean
  collapsed?: boolean
  resizable?: boolean
  minWidth?: number
  maxWidth?: number
  emptyState?: EmptyState
}

const props = withDefaults(defineProps<PaneShellProps>(), {
  collapsible: false,
  collapsed: false,
  resizable: false,
  minWidth: 200,
})

const emit = defineEmits<{
  'update:collapsed': [value: boolean]
  'resize': [width: number]
}>()

defineSlots<{
  'header-actions'(): any
  default(): any
  empty(): any
}>()

const collapsed = defineModel<boolean>('collapsed', { default: false })

const paneEl = ref<HTMLElement | null>(null)
const isResizing = ref(false)
const currentWidth = ref<number | null>(null)

const paneStyle = computed(() => {
  const style: Record<string, string> = {}
  if (currentWidth.value !== null) {
    style.width = `${currentWidth.value}px`
  }
  if (props.minWidth) {
    style.minWidth = `${props.minWidth}px`
  }
  if (props.maxWidth) {
    style.maxWidth = `${props.maxWidth}px`
  }
  return style
})

function toggleCollapsed() {
  collapsed.value = !collapsed.value
}

let startX = 0
let startWidth = 0

function onResizeStart(e: MouseEvent) {
  isResizing.value = true
  startX = e.clientX
  startWidth = paneEl.value?.offsetWidth ?? 200
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
  e.preventDefault()
}

function onResizeMove(e: MouseEvent) {
  if (!isResizing.value) return
  const delta = e.clientX - startX
  let newWidth = startWidth + delta
  if (props.minWidth) newWidth = Math.max(newWidth, props.minWidth)
  if (props.maxWidth) newWidth = Math.min(newWidth, props.maxWidth)
  currentWidth.value = newWidth
  emit('resize', newWidth)
}

function onResizeEnd() {
  isResizing.value = false
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    const parent = paneEl.value?.parentElement
    if (parent) (parent as HTMLElement).focus?.()
  }
}

onMounted(() => {
  paneEl.value?.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  paneEl.value?.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
})

const emptyStateClasses = computed(() => {
  const level = props.emptyState?.level
  return {
    'p-6 text-center flex flex-col items-center gap-3': true,
    'text-muted-foreground': level === 'guide' || level === 'operational',
    'p-3 text-xs': level === 'compact',
    'text-destructive': level === 'error',
  }
})
</script>

<template>
  <div
    ref="paneEl"
    class="flex flex-col overflow-hidden border-r border-border bg-background transition-all duration-200 relative"
    :style="paneStyle"
    tabindex="-1"
  >
    <!-- Header -->
    <div
      v-if="title || $slots['header-actions'] || collapsible"
      class="flex items-center justify-between px-3 py-2 border-b border-border shrink-0"
    >
      <div class="flex items-center gap-1 min-w-0">
        <button
          v-if="collapsible"
          class="p-0.5 rounded hover:bg-muted transition-colors"
          @click="toggleCollapsed"
          :aria-expanded="!collapsed"
        >
          <ChevronRight
            class="size-4 text-muted-foreground transition-transform duration-200"
            :class="{ 'rotate-90': !collapsed }"
          />
        </button>
        <span v-if="title" class="text-sm font-medium text-foreground truncate">{{ title }}</span>
      </div>
      <div v-if="$slots['header-actions']" class="flex items-center gap-1 shrink-0">
        <slot name="header-actions" />
      </div>
    </div>

    <!-- Collapsible body -->
    <Collapsible v-if="collapsible" :open="!collapsed" class="flex flex-col flex-1 overflow-hidden">
      <CollapsibleContent class="flex flex-col flex-1 overflow-hidden">
        <slot v-if="!emptyState || $slots.default" />
        <div v-else-if="emptyState" :class="emptyStateClasses">
          <component :is="emptyState.icon" v-if="emptyState.icon" class="size-8 opacity-50" />
          <slot name="empty">
            <p class="font-medium text-sm">{{ emptyState.title }}</p>
            <p v-if="emptyState.description" class="text-xs opacity-75">{{ emptyState.description }}</p>
          </slot>
        </div>
      </CollapsibleContent>
    </Collapsible>

    <!-- Non-collapsible body -->
    <template v-else>
      <slot v-if="!emptyState || $slots.default" />
      <div v-else-if="emptyState" :class="emptyStateClasses">
        <component :is="emptyState.icon" v-if="emptyState.icon" class="size-8 opacity-50" />
        <slot name="empty">
          <p class="font-medium text-sm">{{ emptyState.title }}</p>
          <p v-if="emptyState.description" class="text-xs opacity-75">{{ emptyState.description }}</p>
        </slot>
      </div>
    </template>

    <!-- Resize handle -->
    <div
      v-if="resizable"
      class="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/30 transition-colors"
      :class="{ 'bg-primary/50': isResizing }"
      @mousedown="onResizeStart"
    />
  </div>
</template>
