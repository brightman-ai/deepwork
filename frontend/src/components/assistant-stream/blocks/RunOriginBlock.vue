<script setup lang="ts">
// 「这一轮为什么没有人提问」—— 显式说明触发来源。
//
// 真实 transcript 里确实存在没有人类提问的 agent 轮：① 后台任务/子 agent 完成的通知把模型
// 唤醒继续干活（一个真实 claude 会话里 35 处）；② `codex exec` 这类非交互运行根本不把 prompt
// 写进 transcript；③ 会话是从更早的记录续接的。
//
// 这些轮**不能**就这么摆一个光秃秃的 AI 头像在那儿 —— 独立体验见证者的原话是"我一开始以为是
// 没加载出来，反复重开确认真的没有"。诚实降级 = 把原因说出来，而不是留白让人自己猜。
import type { AssistantBlock } from '../types'

const props = defineProps<{ block: Extract<AssistantBlock, { type: 'run-origin' }> }>()
</script>

<template>
  <div class="as-origin" data-testid="assistant-run-origin">
    <span class="as-origin__icon" aria-hidden="true">⌁</span>
    <span class="as-origin__text">{{ props.block.text }}</span>
  </div>
</template>

<style scoped>
.as-origin {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding: 3px 9px;
  border: 1px dashed var(--dw-bd);
  border-radius: 999px;
  color: var(--dw-mu);
  font-size: 11.5px;
}
.as-origin__icon {
  font-family: var(--dw-mono);
  opacity: 0.75;
}
</style>
