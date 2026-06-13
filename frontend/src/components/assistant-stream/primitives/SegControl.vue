<script setup lang="ts">
// CHG-014 D: seg 分段控件 (原型 1063/1349)。v-model 双向，options 驱动。
// dense 变体 = viewport seg (.vpseg, 更小内边距)。
export interface SegOption {
  value: string
  label: string
}

withDefaults(defineProps<{
  modelValue: string
  options: SegOption[]
  dense?: boolean
}>(), { dense: false })

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()
</script>

<template>
  <div class="v6-seg" :class="{ 'v6-seg--dense': dense }" data-testid="v6-seg">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      :class="{ on: opt.value === modelValue }"
      @click="emit('update:modelValue', opt.value)"
    >{{ opt.label }}</button>
  </div>
</template>

<style scoped>
.v6-seg {
  display: inline-flex;
  background: var(--dw-sf2);
  border: 1px solid var(--dw-bd);
  border-radius: var(--dw-r2);
  padding: 2px;
  gap: 2px;
}
.v6-seg button {
  padding: 4px 10px;
  border-radius: 5px;
  font-size: 11px;
  color: var(--dw-mu);
  border: 0;
  background: transparent;
  cursor: pointer;
}
.v6-seg button.on {
  background: var(--dw-sf3);
  color: var(--dw-fg);
  font-weight: 500;
}
.v6-seg button:hover:not(.on) { color: var(--dw-fg); }
.v6-seg--dense button { padding: 3px 9px; font-size: 10px; }
</style>
