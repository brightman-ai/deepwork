<script setup lang="ts">
// CHG-014 D2/J3: 新增 artcard 产物卡 (原型 1301, OD 特有)。
// ▤ 文件名 + artifact·文件落盘·v=mtime badge + ✓完成 (streaming 期禁导出) + 打开方式▾。
import type { AssistantBlock } from '../types'

const props = withDefaults(defineProps<{
  block: Extract<AssistantBlock, { type: 'artifact' }>
  // F2: 消费点未接 @block-action → 不渲染 open/export 动作钮（数据诚实）。
  actionable?: boolean
}>(), {
  actionable: true,
})

const emit = defineEmits<{
  (e: 'open'): void          // 打开方式▾
  (e: 'export'): void        // ✓完成 (仅非 streaming)
}>()
</script>

<template>
  <div class="v6-artcard" data-testid="assistant-artifact-card">
    <span class="v6-artcard__ic">▤</span>
    <b class="v6-artcard__name">{{ props.block.name }}</b>
    <span class="v6-artcard__bd v6-artcard__bd--ok">
      artifact{{ props.block.landed ? ' · 文件落盘' : '' }}{{ props.block.version ? ` · v=${props.block.version}` : '' }}
    </span>
    <span
      v-if="props.block.done && !props.actionable"
      class="v6-artcard__bd v6-artcard__bd--ok"
    >✓ 完成</span>
    <button
      v-if="props.block.done && props.actionable"
      type="button"
      class="v6-artcard__bd v6-artcard__done"
      :disabled="props.block.streaming"
      :title="props.block.streaming ? '生成中，暂不可导出' : '导出'"
      @click="!props.block.streaming && emit('export')"
    >✓ 完成</button>
    <button v-if="props.actionable" type="button" class="v6-artcard__openw" @click="emit('open')">打开方式 ▾</button>
  </div>
</template>

<style scoped>
.v6-artcard {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 12px;
  border: 1px solid var(--dw-bd);
  border-radius: var(--dw-r2);
  background: var(--dw-sf);
  margin: 7px 0;
  font-size: 12px;
}
.v6-artcard:hover { border-color: var(--dw-mu); }
.v6-artcard__ic { flex-shrink: 0; }
.v6-artcard__name { font-size: 12px; }
.v6-artcard__bd {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--dw-sf2);
  color: var(--dw-mu);
  border: 1px solid var(--dw-bd);
  flex-shrink: 0;
}
.v6-artcard__bd--ok { color: var(--dw-ok); background: var(--dw-ok-dim); }
.v6-artcard__done { cursor: pointer; }
.v6-artcard__done:disabled { opacity: 0.5; cursor: not-allowed; }
.v6-artcard__openw {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border: 1px solid var(--dw-bd);
  border-radius: var(--dw-r2);
  font-size: 10.5px;
  color: var(--dw-mu);
  background: transparent;
  cursor: pointer;
}
.v6-artcard__openw:hover { border-color: var(--dw-ac); color: var(--dw-ac); }
</style>
