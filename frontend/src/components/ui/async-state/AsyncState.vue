<script setup lang="ts">
defineProps<{
  loading: boolean
  error?: string | null
}>()
</script>

<template>
  <div>
    <!-- Loading state: show skeleton slot or default skeleton -->
    <slot v-if="loading" name="loading">
      <div class="space-y-2 animate-pulse">
        <div class="h-4 bg-muted rounded w-3/4" />
        <div class="h-4 bg-muted rounded w-1/2" />
        <div class="h-4 bg-muted rounded w-2/3" />
      </div>
    </slot>
    <!-- Error state -->
    <slot v-else-if="error" name="error" :error="error">
      <div class="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
        {{ error }}
      </div>
    </slot>
    <!-- Default/result state -->
    <slot v-else />
  </div>
</template>
