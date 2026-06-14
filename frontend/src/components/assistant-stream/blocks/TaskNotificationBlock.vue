<script setup lang="ts">
// CHG-014 P3b (Gap-4) — task-notification 楼层块。
// 后台任务 / 派发 agent 完成时, runtime 发一条系统事件 (claude `<task-notification>`
// user 行, 真 schema: status ∈ completed|failed|killed + <summary>)。从前它落到通用
// TextBlock → 丑的满宽气泡。现作为一等 block kind 渲染为**紧凑单行卡**:
//   图标(✓/⚠/⊘) + 状态徽章(复用 .ai-chip 视觉语汇) + 简述 + 右对齐 mono 时间。
// 不占满宽气泡 (它不是用户消息, 是系统通知)。扩展点: 未来更多系统事件块同范式。
import { computed } from 'vue'
import type { AssistantTaskNotificationBlock } from '../types'

const props = defineProps<{
  block: AssistantTaskNotificationBlock
  streaming?: boolean
}>()

type Tone = 'ok' | 'warn' | 'red'
const STATUS: Record<string, { icon: string; label: string; tone: Tone }> = {
  completed: { icon: '✓', label: '已完成', tone: 'ok' },
  failed: { icon: '⚠', label: '失败', tone: 'red' },
  killed: { icon: '⊘', label: '已终止', tone: 'warn' },
}

const meta = computed(() => {
  const s = (props.block.status ?? '').toLowerCase()
  return STATUS[s] ?? { icon: '🔔', label: props.block.status || '通知', tone: 'warn' as Tone }
})

const summary = computed(() => props.block.summary?.trim() || '后台任务通知')

// 右对齐 mono 时间 (HH:MM, 缺则省)。
const time = computed(() => {
  const at = props.block.at
  if (!at) return ''
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
})
</script>

<template>
  <div
    class="as-tn"
    :class="`as-tn--${meta.tone}`"
    data-testid="assistant-task-notification-block"
  >
    <span class="as-tn__icon" aria-hidden="true">{{ meta.icon }}</span>
    <span class="as-tn__badge">{{ meta.label }}</span>
    <span class="as-tn__sum">{{ summary }}</span>
    <span class="as-tn__grow" />
    <span v-if="time" class="as-tn__time">{{ time }}</span>
  </div>
</template>

<style scoped>
/* 紧凑单行卡 — 复用 strip/ai-chip 视觉语汇, 不占满宽气泡。 */
.as-tn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 12px;
  margin: 4px 0;
  background: var(--dw-sf);
  border: 1px solid var(--dw-bd);
  border-left: 2px solid var(--dw-mu);
  border-radius: var(--dw-r2);
  font-size: 12px;
  color: var(--dw-mu);
}
.as-tn--ok { border-left-color: var(--dw-ok); }
.as-tn--warn { border-left-color: var(--dw-warn); }
.as-tn--red { border-left-color: var(--dw-red); }

.as-tn__icon { flex-shrink: 0; font-size: 12px; }
.as-tn--ok .as-tn__icon { color: var(--dw-ok); }
.as-tn--warn .as-tn__icon { color: var(--dw-warn); }
.as-tn--red .as-tn__icon { color: var(--dw-red); }

/* 状态徽章 — .ai-chip 范式 (小号 mono pill)。 */
.as-tn__badge {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 3px;
  font-family: var(--dw-mono);
  font-size: 10px;
  font-weight: 500;
  border: 1px solid var(--dw-bd);
}
.as-tn--ok .as-tn__badge {
  color: var(--dw-ok);
  background: var(--dw-ok-dim);
  border-color: var(--dw-ok-dim);
}
.as-tn--warn .as-tn__badge {
  color: var(--dw-warn);
  background: var(--dw-warn-dim);
  border-color: var(--dw-warn-dim);
}
.as-tn--red .as-tn__badge {
  color: var(--dw-red);
  background: var(--dw-red-dim);
  border-color: var(--dw-red-dim);
}

.as-tn__sum {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.as-tn__grow { flex: 1; }
.as-tn__time {
  flex-shrink: 0;
  font-family: var(--dw-mono);
  font-size: 11px;
  opacity: 0.8;
}
</style>
