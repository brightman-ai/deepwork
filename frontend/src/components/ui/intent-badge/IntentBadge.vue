<script setup lang="ts">
import { Info } from 'lucide-vue-next'
import { Popover, PopoverContent, PopoverTrigger } from '@ce/components/ui/popover'

defineProps<{
  label: string
  detail?: string
}>()
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <button class="inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted transition-colors cursor-default">
        <Info class="h-3 w-3" />
        <span>{{ label }}</span>
      </button>
    </PopoverTrigger>
    <PopoverContent v-if="detail" class="w-64 text-sm">
      {{ detail }}
    </PopoverContent>
  </Popover>
</template>
