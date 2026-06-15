<script setup lang="ts">
// WS2: 首 token 等待期的「有生命力」loading。等待 10s+ 也持续动效表明在工作。
// - 流光进度条 (CSS @keyframes，无确定进度时来回扫光)
// - 骨架行呼吸 (占位文本块，匹配后续真实内容的视觉重量)
// - 秒数计时 + 阶段文案 (status 事件驱动: 读取上下文→生成中…)
// 纯 CSS 动效，暗色风格走 v6 token，respect prefers-reduced-motion。
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { AssistantBlock } from '../types'

const props = defineProps<{
  block: Extract<AssistantBlock, { type: 'waiting' }>
}>()

// 秒数实时跳动 (每 100ms 重算)，等待越久数字越大 → 用户感知「还在动」。
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now()
  }, 100)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

function elapsed(): string {
  if (!props.block.startedAt) return ''
  return `${((now.value - props.block.startedAt) / 1000).toFixed(1)}s`
}
</script>

<template>
  <div class="v6-wait" data-testid="assistant-waiting-block">
    <div class="v6-wait__head">
      <span class="v6-wait__dot" aria-hidden="true" />
      <span class="v6-wait__status">{{ props.block.status || '生成中' }}</span>
      <small v-if="props.block.startedAt" class="v6-wait__tm">{{ elapsed() }}</small>
    </div>
    <!-- 流光进度条: 无确定进度，扫光来回表「正在工作」 -->
    <div class="v6-wait__bar" aria-hidden="true">
      <span class="v6-wait__bar-glow" />
    </div>
    <!-- 骨架行: 呼吸占位，预示即将到来的文本 -->
    <div class="v6-wait__skel" aria-hidden="true">
      <span class="v6-wait__line v6-wait__line--1" />
      <span class="v6-wait__line v6-wait__line--2" />
      <span class="v6-wait__line v6-wait__line--3" />
    </div>
  </div>
</template>

<style scoped>
.v6-wait {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 10px 12px;
  border: 1px solid var(--dw-bd);
  border-radius: var(--dw-r2, 8px);
  background: var(--dw-sf);
  margin: 4px 0;
}

.v6-wait__head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.v6-wait__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dw-ac);
  flex-shrink: 0;
  animation: v6-wait-pulse 1.3s ease-in-out infinite;
}
.v6-wait__status {
  font-size: 12px;
  color: var(--dw-fg);
}
.v6-wait__tm {
  margin-left: auto;
  font-family: var(--dw-mono);
  font-size: 10px;
  color: var(--dw-mu);
  font-variant-numeric: tabular-nums;
}

/* 流光进度条 */
.v6-wait__bar {
  position: relative;
  height: 3px;
  border-radius: 3px;
  background: var(--dw-bd);
  overflow: hidden;
}
.v6-wait__bar-glow {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 40%;
  border-radius: 3px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--dw-ac) 50%,
    transparent 100%
  );
  animation: v6-wait-sweep 1.5s ease-in-out infinite;
}

/* 骨架行 */
.v6-wait__skel {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.v6-wait__line {
  height: 9px;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    var(--dw-sf2) 0%,
    var(--dw-sf3) 50%,
    var(--dw-sf2) 100%
  );
  background-size: 200% 100%;
  animation: v6-wait-shimmer 1.8s linear infinite;
}
.v6-wait__line--1 { width: 92%; }
.v6-wait__line--2 { width: 78%; animation-delay: 0.2s; }
.v6-wait__line--3 { width: 54%; animation-delay: 0.4s; }

@keyframes v6-wait-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.8); }
}
@keyframes v6-wait-sweep {
  0% { left: -42%; }
  100% { left: 100%; }
}
@keyframes v6-wait-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .v6-wait__dot,
  .v6-wait__bar-glow,
  .v6-wait__line {
    animation: none;
  }
  .v6-wait__bar-glow {
    left: 0;
    width: 100%;
    opacity: 0.5;
  }
}
</style>
