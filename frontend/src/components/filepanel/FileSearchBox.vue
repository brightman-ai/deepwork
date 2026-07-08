<script setup lang="ts">
/**
 * FileSearchBox — the ONE search-input primitive for FilePanel (最近 · 目录 filters).
 * Owns only the input chrome (magnifier + input + conditional clear-×); filtering,
 * result rendering and row actions stay with the consumer (they genuinely differ). Styled
 * with --dw-* tokens so it renders identically in every host (no per-repo Tailwind dep).
 */
import { Search, X } from 'lucide-vue-next'

defineProps<{
  modelValue: string
  placeholder?: string
  testid?: string
}>()

defineEmits<{ (e: 'update:modelValue', value: string): void }>()
</script>

<template>
  <div class="fsb">
    <Search class="fsb-ic" />
    <input
      :value="modelValue"
      type="text"
      inputmode="search"
      :placeholder="placeholder"
      class="fsb-in"
      :data-testid="testid"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <button
      v-if="modelValue"
      class="fsb-clear"
      type="button"
      title="清除"
      :data-testid="testid ? `${testid}-clear` : undefined"
      @click="$emit('update:modelValue', '')"
    ><X class="fsb-ic" /></button>
  </div>
</template>

<style scoped>
.fsb { display: flex; min-width: 0; align-items: center; gap: 6px; }
.fsb-ic { width: 14px; height: 14px; flex-shrink: 0; color: var(--dw-mu, hsl(var(--muted-foreground))); }
.fsb-in {
  min-width: 0; flex: 1; background: transparent; border: none; outline: none;
  font-size: 12px; color: var(--dw-fg, hsl(var(--foreground)));
}
.fsb-in::placeholder { color: var(--dw-mu, hsl(var(--muted-foreground))); opacity: 0.7; }
.fsb-clear {
  flex-shrink: 0; border: none; background: none; cursor: pointer; padding: 2px;
  border-radius: 4px; color: var(--dw-mu, hsl(var(--muted-foreground)));
}
.fsb-clear:hover { background: var(--dw-sf2, hsl(var(--muted))); color: var(--dw-fg, hsl(var(--foreground))); }
</style>
