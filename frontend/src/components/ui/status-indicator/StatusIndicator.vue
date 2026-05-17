<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@ce/lib/utils'

type Status = 'online' | 'warning' | 'error' | 'offline' | 'loading'

const props = withDefaults(defineProps<{
  status: Status
  label?: string
  class?: string
  size?: 'sm' | 'md'
}>(), { size: 'md' })

const dotClass = computed(() => ({
  'bg-green-500': props.status === 'online',
  'bg-yellow-500 animate-pulse': props.status === 'warning',
  'bg-red-500': props.status === 'error',
  'bg-gray-400': props.status === 'offline',
  'bg-blue-500 animate-pulse': props.status === 'loading',
  'h-2 w-2': props.size === 'sm',
  'h-2.5 w-2.5': props.size === 'md',
}))
</script>

<template>
  <span :class="cn('inline-flex items-center gap-1.5', props.class)">
    <span :class="cn('rounded-full shrink-0', dotClass)" />
    <span v-if="label" class="text-xs text-muted-foreground">{{ label }}</span>
  </span>
</template>
