<script setup lang="ts">
import { ref, computed } from 'vue'
import PaneShell from './PaneShell.vue'
import type { PaneShellProps } from './PaneShell.vue'
import { ScrollArea } from '@ce/components/ui/scroll-area'
import { Input } from '@ce/components/ui/input'
import { Search } from 'lucide-vue-next'

interface PanelPaneProps {
  display?: 'list' | 'tree' | 'grid' | 'table'
  searchable?: boolean
  searchPlaceholder?: string
  loading?: boolean
  emptyState?: PaneShellProps['emptyState']
  title?: string
}

const props = withDefaults(defineProps<PanelPaneProps>(), {
  display: 'list',
  searchable: true,
  searchPlaceholder: 'Search...',
  loading: false,
})

const emit = defineEmits<{
  'select': [item: any]
  'search': [query: string]
  'action': [actionId: string, item?: any]
}>()

defineSlots<{
  item(props: { item: any; index: number; selected: boolean }): any
  actions(): any
  'header-actions'(): any
  empty(): any
  footer(): any
}>()

const searchQuery = ref('')

function onSearchInput(e: Event) {
  const val = (e.target as HTMLInputElement).value
  searchQuery.value = val
  emit('search', val)
}

const contentClass = computed(() => ({
  'p-1': props.display === 'list' || props.display === 'tree',
  'p-2 grid grid-cols-2 gap-2': props.display === 'grid',
  'w-full': props.display === 'table',
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

    <div class="flex flex-col flex-1 overflow-hidden">
      <!-- Search bar -->
      <div v-if="searchable" class="px-2 py-1.5 border-b border-border shrink-0">
        <div class="relative">
          <Search class="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            :value="searchQuery"
            :placeholder="searchPlaceholder"
            class="w-full h-[44px] pl-7 pr-2 text-[16px] sm:h-auto sm:py-1 sm:text-xs bg-muted/50 rounded border border-input focus:outline-none focus:ring-1 focus:ring-ring"
            @input="onSearchInput"
          />
        </div>
      </div>

      <!-- Content area -->
      <ScrollArea class="flex-1">
        <div v-if="loading" class="flex justify-center p-4">
          <span class="text-xs text-muted-foreground animate-pulse">Loading...</span>
        </div>
        <div v-else :class="contentClass">
          <slot name="item" :item="{}" :index="0" :selected="false" />
        </div>
      </ScrollArea>

      <!-- Actions bar -->
      <div
        v-if="$slots.actions"
        class="shrink-0 border-t border-border px-2 py-1.5 flex items-center gap-1"
      >
        <slot name="actions" />
      </div>

      <!-- Footer slot -->
      <div v-if="$slots.footer" class="shrink-0 border-t border-border">
        <slot name="footer" />
      </div>
    </div>
  </PaneShell>
</template>
