<script setup lang="ts">
// CHG-014 D/D6: heat 三档条 (原型 .heatb)。--heat 0-1 喂条的 amber alpha。
// 纯展示。value 自动 clamp 到 [0,1]。
import { computed } from 'vue'

const props = withDefaults(defineProps<{ value: number }>(), { value: 0 })

const clamped = computed(() => Math.max(0, Math.min(1, props.value)))
</script>

<template>
  <div class="v6-heatb" :style="{ '--heat': clamped }" data-testid="v6-heatbar" />
</template>

<style scoped>
.v6-heatb {
  height: 2px;
  border-radius: 2px;
  background: oklch(72% 0.14 55 / var(--heat, 0));
  margin-top: 2px;
}
</style>
