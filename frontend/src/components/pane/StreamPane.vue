<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import PaneShell from './PaneShell.vue'
import type { PaneShellProps } from './PaneShell.vue'

interface StreamPaneProps {
  mode?: 'full' | 'compact' | 'mini'
  direction?: 'append' | 'prepend'
  stickyScroll?: boolean
  showComposer?: boolean
  loading?: boolean
  emptyState?: PaneShellProps['emptyState']
  title?: string
}

const props = withDefaults(defineProps<StreamPaneProps>(), {
  mode: 'full',
  direction: 'append',
  stickyScroll: true,
  showComposer: undefined,
  loading: false,
})

const emit = defineEmits<{
  'scroll-top': []
  'composer-submit': [value: string]
}>()

defineSlots<{
  item(props: { item: any; index: number }): any
  composer(): any
  'header-actions'(): any
  empty(): any
}>()

const showComposerComputed = computed(() =>
  props.showComposer !== undefined ? props.showComposer : props.mode === 'full'
)

const itemScrollerRef = ref<HTMLDivElement | null>(null)

async function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
  await nextTick()
  const el = itemScrollerRef.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior })
}

async function jumpToBottom() {
  await scrollToBottom('auto')
}
defineExpose({ scrollToBottom, jumpToBottom })

const containerClass = computed(() => ({
  'flex flex-col flex-1 overflow-hidden': true,
  'text-sm': props.mode === 'full',
  'text-xs': props.mode === 'compact' || props.mode === 'mini',
}))
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

    <div :class="containerClass">
      <!-- Item area: flex-1, adapters manage their own scroll -->
      <div ref="itemScrollerRef" class="flex-1 overflow-y-auto flex flex-col min-h-0">
        <div v-if="loading" class="flex justify-center p-4 shrink-0">
          <span class="text-xs text-muted-foreground animate-pulse">Loading...</span>
        </div>
        <slot name="item" :item="{}" :index="0" />
      </div>

      <!-- Composer slot -->
      <div
        v-if="showComposerComputed && $slots.composer"
        class="shrink-0 border-t border-border"
      >
        <slot name="composer" />
      </div>
    </div>
  </PaneShell>
</template>
