<script setup lang="ts">
// CHG-014 D2: fref 文件锚 chip (原型 1093/1106/1314)。
// 蓝色 pill + 可选行号 ln (灰)。点击回调 → WorkArea 审查/文件定位。
defineProps<{
  path: string
  line?: number
}>()

const emit = defineEmits<{ (e: 'open'): void }>()
</script>

<template>
  <span
    class="v6-fref"
    role="button"
    tabindex="0"
    data-testid="assistant-file-ref"
    @click="emit('open')"
    @keydown.enter="emit('open')"
  >
    {{ path }}<span v-if="line !== undefined" class="v6-fref__ln">(line {{ line }})</span>
  </span>
</template>

<style scoped>
.v6-fref {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--dw-blu-dim);
  color: var(--dw-blu);
  font-family: var(--dw-mono);
  font-size: 10px;
  cursor: pointer;
  vertical-align: 1px;
  white-space: nowrap;
}
.v6-fref:hover { background: var(--dw-blu-hover-dim); }
.v6-fref__ln { opacity: 0.65; }
</style>
