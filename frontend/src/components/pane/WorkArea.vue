<script setup lang="ts">
import { ref, computed } from 'vue'
import PanelPane from './PanelPane.vue'
import CanvasPane from './CanvasPane.vue'
import type { PaneShellProps } from './PaneShell.vue'
import { Button } from '@ce/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@ce/components/ui/dropdown-menu'
import { X, ChevronDown, FolderOpen } from 'lucide-vue-next'

interface WorkAreaTab {
  id: string
  label: string
  closable?: boolean
}

interface WorkAreaProps {
  explorerTitle?: string
  maxVisibleTabs?: number
  emptyState?: PaneShellProps['emptyState']
  tabs?: WorkAreaTab[]
  activeTabId?: string
}

const props = withDefaults(defineProps<WorkAreaProps>(), {
  explorerTitle: 'Explorer',
  maxVisibleTabs: 5,
})

const emit = defineEmits<{
  'tab-select': [id: string]
  'tab-close': [id: string]
  'explorer-select': [item: any]
}>()

defineSlots<{
  'explorer-item'(props: { item: any; index: number; selected: boolean }): any
  preview(props: { tab: WorkAreaTab }): any
  empty(): any
}>()

const internalActiveTab = ref<string | null>(null)

const activeTab = computed(() =>
  // Default to '__explorer' so the explorer pane is visible on first render
  props.activeTabId ?? internalActiveTab.value ?? props.tabs?.[0]?.id ?? '__explorer'
)

const allTabs = computed(() => props.tabs ?? [])

// Explorer is a synthetic first tab, real tabs start at index 0 of allTabs
const visibleTabs = computed(() => allTabs.value.slice(0, props.maxVisibleTabs))
const overflowTabs = computed(() => allTabs.value.slice(props.maxVisibleTabs))

function selectTab(id: string) {
  internalActiveTab.value = id
  emit('tab-select', id)
}

function closeTab(id: string, e: MouseEvent) {
  e.stopPropagation()
  emit('tab-close', id)
}

function tabTestId(prefix: string, id: string): string {
  return `${prefix}-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

const activeTabData = computed(() =>
  allTabs.value.find(t => t.id === activeTab.value) ?? null
)
</script>

<template>
  <div class="flex flex-col flex-1 overflow-hidden bg-background">
    <!-- Tab bar -->
    <div class="flex items-center border-b border-border shrink-0 bg-muted/20 overflow-x-auto">
      <!-- Explorer tab -->
      <button
        class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-r border-border shrink-0 transition-colors"
        :class="activeTab === '__explorer' ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'"
        :aria-label="`打开${explorerTitle}`"
        data-testid="workarea-tab-explorer"
        @click="selectTab('__explorer')"
      >
        <FolderOpen class="size-3.5" />
        {{ explorerTitle }}
      </button>

      <!-- Content tabs -->
      <template v-for="tab in visibleTabs" :key="tab.id">
        <div
          class="flex items-center border-r border-border shrink-0 transition-colors max-w-[180px]"
          :class="activeTab === tab.id ? 'bg-background text-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'"
        >
          <button
            class="min-w-0 flex-1 px-3 py-2 text-left text-xs"
            :aria-label="`打开标签 ${tab.label}`"
            :data-testid="tabTestId('workarea-tab', tab.id)"
            @click="selectTab(tab.id)"
          >
            <span class="block truncate">{{ tab.label }}</span>
          </button>
          <button
            v-if="tab.closable !== false"
            class="mr-1 p-0.5 rounded hover:bg-muted transition-colors shrink-0"
            :aria-label="`关闭标签 ${tab.label}`"
            :data-testid="tabTestId('workarea-tab-close', tab.id)"
            @click="closeTab(tab.id, $event)"
          >
            <X class="size-3" />
          </button>
        </div>
      </template>

      <!-- Overflow dropdown -->
      <DropdownMenu v-if="overflowTabs.length > 0">
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="xs" class="ml-1 px-2 shrink-0">
            +{{ overflowTabs.length }}
            <ChevronDown class="size-3 ml-0.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            v-for="tab in overflowTabs"
            :key="tab.id"
            @click="selectTab(tab.id)"
          >
            {{ tab.label }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-hidden">
      <!-- Explorer pane -->
      <PanelPane
        v-if="activeTab === '__explorer'"
        :title="explorerTitle"
        display="tree"
        :searchable="true"
        class="h-full border-r-0"
        @select="emit('explorer-select', $event)"
      >
        <template #item="slotProps">
          <slot name="explorer-item" v-bind="slotProps" />
        </template>
        <template #empty>
          <slot name="empty" />
        </template>
      </PanelPane>

      <!-- Preview pane for active content tab -->
      <CanvasPane
        v-else-if="activeTabData"
        :title="activeTabData.label"
        mode="readonly"
        :show-toolbar="true"
        :empty-state="emptyState"
        class="h-full border-r-0"
      >
        <slot name="preview" :tab="activeTabData" />
        <template #empty>
          <slot name="empty" />
        </template>
      </CanvasPane>
    </div>
  </div>
</template>
