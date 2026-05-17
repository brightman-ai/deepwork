<script setup lang="ts">
import type { AssistantBlock } from '../types'

const props = defineProps<{
  block: Extract<AssistantBlock, { type: 'permission' }>
}>()
</script>

<template>
  <div class="as-block as-block--permission">
    <strong>需要确认</strong>
    <span>{{ props.block.content }}</span>
    <small v-if="props.block.effectClass">{{ props.block.effectClass }}</small>
  </div>
</template>
