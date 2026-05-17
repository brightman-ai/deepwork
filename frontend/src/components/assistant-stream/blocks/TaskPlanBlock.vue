<script setup lang="ts">
import type { AssistantBlock } from '../types'

const props = defineProps<{
  block: Extract<AssistantBlock, { type: 'task-plan' }>
}>()

function statusLabel(status: string): string {
  if (status === 'completed') return '完成'
  if (status === 'in_progress') return '进行中'
  return '待办'
}
</script>

<template>
  <div class="as-block as-task-plan" data-testid="assistant-task-plan">
    <div class="as-task-plan__head">
      <span class="as-block__icon">□</span>
      <strong>任务计划 {{ props.block.tasks.length }} 项</strong>
      <small>
        {{ props.block.tasks.filter(t => t.status === 'in_progress').length }} 进行中 ·
        {{ props.block.tasks.filter(t => t.status === 'completed').length }} 完成
      </small>
    </div>
    <ol>
      <li
        v-for="(task, i) in props.block.tasks.slice(0, 8)"
        :key="task.id ?? i"
        :class="`as-task-plan__item as-task-plan__item--${task.status}`"
      >
        <span>{{ statusLabel(task.status) }}</span>
        <strong>{{ task.content }}</strong>
      </li>
    </ol>
  </div>
</template>
