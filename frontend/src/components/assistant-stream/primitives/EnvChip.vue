<script setup lang="ts">
// CHG-014 D3: envchip 环境 chip (原型 .envchip)，composer envrow 的构件。
// 默认中性；warn 变体 (琥珀边) 用于权限警示。点击展开 msel/弹窗 (回调)。
withDefaults(defineProps<{
  label: string
  warn?: boolean
  caret?: boolean            // 显示 ▾ (有弹窗)
}>(), { warn: false, caret: true })

const emit = defineEmits<{ (e: 'click'): void }>()
</script>

<template>
  <span
    class="v6-envchip"
    :class="{ 'v6-envchip--warn': warn }"
    role="button"
    tabindex="0"
    data-testid="v6-env-chip"
    @click="emit('click')"
    @keydown.enter="emit('click')"
  >
    <slot name="lead" />
    <span>{{ label }}</span>
    <span v-if="caret">▾</span>
  </span>
</template>

<style scoped>
.v6-envchip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid var(--dw-bd);
  background: var(--dw-sf);
  font-family: var(--dw-mono);
  font-size: 10px;
  color: var(--dw-mu);
  cursor: pointer;
}
.v6-envchip:hover { border-color: var(--dw-mu); color: var(--dw-fg); }
.v6-envchip--warn {
  color: var(--dw-warn);
  border-color: var(--dw-warn-border-soft);
  background: var(--dw-warn-surface-soft);
}
</style>
