<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  FileText,
  MessageSquarePlus,
  Users,
  FolderPlus,
  PanelLeftClose,
} from 'lucide-vue-next'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@ce/components/ui/command'
import { enabledPortalNavItems, utilityNavItems } from '@ce/lib/portalNav'

const emit = defineEmits<{
  toggleSidebar: []
}>()

const open = ref(false)
const router = useRouter()

function handleKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    open.value = !open.value
  }
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))

function navigateTo(path: string) {
  open.value = false
  router.push(path)
}

function toggleSidebar() {
  open.value = false
  emit('toggleSidebar')
}

const quickActions = [
  {
    label: 'New Topic Note',
    icon: FileText,
    path: '/',
    shortcut: undefined,
  },
  {
    label: 'New Chat',
    icon: MessageSquarePlus,
    path: '/chat',
    shortcut: undefined,
  },
  {
    label: 'New Council',
    icon: Users,
    path: '/council/new',
    shortcut: undefined,
  },
  {
    label: 'New Workspace Session',
    icon: FolderPlus,
    path: '/ws',
    shortcut: undefined,
  },
]

const allNavItems = [...enabledPortalNavItems, ...utilityNavItems]
</script>

<template>
  <CommandDialog :open="open" @update:open="open = $event">
    <CommandInput placeholder="Type a command or search..." />
    <CommandList>
      <CommandEmpty>No results found.</CommandEmpty>

      <CommandGroup heading="Quick Actions">
        <CommandItem
          v-for="action in quickActions"
          :key="action.label"
          :value="action.label"
          @select="navigateTo(action.path)"
        >
          <component :is="action.icon" class="mr-2 h-4 w-4" />
          <span>{{ action.label }}</span>
          <CommandShortcut v-if="action.shortcut">{{ action.shortcut }}</CommandShortcut>
        </CommandItem>
      </CommandGroup>

      <CommandSeparator />

      <CommandGroup heading="Navigate">
        <CommandItem
          v-for="item in allNavItems"
          :key="item.name"
          :value="`Navigate ${item.label} ${item.description}`"
          @select="navigateTo(item.path)"
        >
          <component :is="item.icon" class="mr-2 h-4 w-4" />
          <span>{{ item.label }}</span>
          <CommandShortcut v-if="item.description" class="ml-auto text-xs text-muted-foreground">
            {{ item.description }}
          </CommandShortcut>
        </CommandItem>
      </CommandGroup>

      <CommandSeparator />

      <CommandGroup heading="Commands">
        <CommandItem value="Toggle Sidebar" @select="toggleSidebar">
          <PanelLeftClose class="mr-2 h-4 w-4" />
          <span>Toggle Sidebar</span>
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </CommandDialog>
</template>
