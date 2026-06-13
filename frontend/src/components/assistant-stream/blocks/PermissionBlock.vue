<script setup lang="ts">
// CHG-014 S8 F1: 单一 permission/approval 契约。chip ch-appr + 标题 + 等待计时 +
// appr-cmd 命令体 + 三钮 (允许一次/总是允许/拒绝)。全部字段从 block 读取（types.ts
// AssistantPermissionBlock），不再有与 block 错位的独立 props。动作经 emit 回调，
// 本组件零业务。F2: 未接线时由 surface 关闭动作钮渲染（actionable=false）。
import { computed } from 'vue'
import type { AssistantBlock } from '../types'

const props = withDefaults(defineProps<{
  block: Extract<AssistantBlock, { type: 'permission' }>
  // F2 数据诚实：消费点未接审批 API 时不渲染可点但无效的按钮。
  actionable?: boolean
}>(), {
  actionable: true,
})

const emit = defineEmits<{
  (e: 'allow-once'): void
  (e: 'allow-always'): void
  (e: 'deny'): void
}>()

// 标题/命令双源回退：approval 形态用 title/command，旧 permission 形态用 content/effectClass。
const heading = computed(() => props.block.title || props.block.content || '需要确认')
const commandBody = computed(() => props.block.command || props.block.effectClass || '')
</script>

<template>
  <div class="v6-appr" data-testid="assistant-permission-block">
    <div class="v6-appr__h">
      <span class="v6-chip v6-chip--appr">{{ props.block.tool || '需要审批' }}</span>
      <b>{{ heading }}</b>
      <span v-if="props.block.waited" class="v6-appr__wait">等待 {{ props.block.waited }}</span>
    </div>
    <div v-if="commandBody" class="v6-appr__cmd">{{ commandBody }}</div>
    <div v-if="props.actionable" class="v6-appr__bts">
      <button type="button" class="v6-appr__y" data-testid="permission-allow-once" @click="emit('allow-once')">允许一次</button>
      <button type="button" class="v6-appr__a" data-testid="permission-allow-always" @click="emit('allow-always')">{{ props.block.alwaysLabel || '总是允许' }}</button>
      <button type="button" class="v6-appr__n" data-testid="permission-deny" @click="emit('deny')">拒绝</button>
    </div>
  </div>
</template>

<style scoped>
.v6-appr {
  border: 1px solid var(--dw-warn-border-dim);
  background: var(--dw-warn-surface-dim);
  border-radius: var(--dw-r2);
  padding: 10px 12px;
  margin: 4px 0;
}
.v6-appr__h {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 7px;
  font-size: 12px;
  font-weight: 500;
}
.v6-chip {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 3px;
  font-family: var(--dw-mono);
  font-size: 10px;
  font-weight: 500;
  border: 1px solid var(--dw-bd);
  white-space: nowrap;
  flex-shrink: 0;
}
.v6-chip--appr { color: var(--dw-warn); background: var(--dw-warn-chip-dim); }
.v6-appr__wait {
  font-family: var(--dw-mono);
  font-size: 11px;
  color: var(--dw-mu);
  margin-left: auto;
}
.v6-appr__cmd {
  font-family: var(--dw-mono);
  font-size: 11px;
  background: var(--dw-bg);
  border: 1px solid var(--dw-bd);
  border-radius: var(--dw-r);
  padding: 7px 10px;
  margin-bottom: 9px;
  overflow-x: auto;
}
.v6-appr__bts { display: flex; gap: 7px; flex-wrap: wrap; }
.v6-appr__bts button {
  padding: 5px 13px;
  border-radius: var(--dw-r2);
  font-size: 11px;
  font-weight: 500;
  border: 1px solid var(--dw-bd);
  cursor: pointer;
}
.v6-appr__y {
  background: var(--dw-warn);
  color: var(--dw-on-accent);
  border: none !important;
}
.v6-appr__a { background: var(--dw-sf2); color: var(--dw-fg); }
.v6-appr__n { color: var(--dw-mu); background: transparent; }
.v6-appr__n:hover { color: var(--dw-fg); }
</style>
