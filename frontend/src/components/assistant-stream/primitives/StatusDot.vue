<script setup lang="ts">
// CHG-014 D: sd 状态点 (原型 .sd)。busy=绿脉冲 idle=灰静 wait=黄脉冲 dead=红静。
defineProps<{ state: 'busy' | 'idle' | 'wait' | 'dead' }>()
</script>

<template>
  <span class="v6-sd" :class="`v6-sd--${state}`" data-testid="v6-status-dot" />
</template>

<style scoped>
.v6-sd {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}
.v6-sd--idle { background: var(--dw-mu); }
.v6-sd--busy { background: var(--dw-ok); animation: v6-sd-bp 1.4s infinite; }
.v6-sd--dead { background: var(--dw-red); }
.v6-sd--wait { background: var(--dw-warn); animation: v6-sd-bp 1.2s infinite; }
@keyframes v6-sd-bp {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
</style>
