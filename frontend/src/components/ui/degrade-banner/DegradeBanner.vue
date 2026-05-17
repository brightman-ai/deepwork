<script setup lang="ts">
import { TriangleAlert } from 'lucide-vue-next'

defineProps<{
  message: string
  actionLabel?: string
}>()

defineEmits<{
  (e: 'action'): void
}>()
</script>

<template>
  <div class="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-sm">
    <TriangleAlert class="h-4 w-4 shrink-0 text-yellow-600" />
    <span class="flex-1 text-yellow-800 dark:text-yellow-200">{{ message }}</span>
    <button
      v-if="actionLabel"
      class="shrink-0 text-xs font-medium text-yellow-700 hover:text-yellow-900 underline underline-offset-2 cursor-pointer"
      @click="$emit('action')"
    >
      {{ actionLabel }}
    </button>
  </div>
</template>
