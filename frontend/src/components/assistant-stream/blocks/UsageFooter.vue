<script setup lang="ts">
// CHG-014 D2: 重塑到原型 rmeta 轮次 footer (原型 1107)。
// TTFT△ / 总耗时 / ↓in ↑out / 缓存读 / 模型 / 时间 + hover 动作钮 (⧉⟳⤴⑂)。
// 数据 ← D5① turns。缺源字段一律显「—」(不省整行，保持栅格稳定)。
import { computed } from 'vue'
import type { AssistantMessage, AssistantUsageInfo } from '../types'

const props = withDefaults(defineProps<{
  message: AssistantMessage
  streaming?: boolean
  // F2: 消费点未接 copy/retry/project/branch → 不渲染动作钮（数据诚实，metrics 行照常显示）。
  actionable?: boolean
}>(), {
  actionable: true,
})

const emit = defineEmits<{
  (e: 'copy'): void
  (e: 'retry'): void
  (e: 'project'): void
  (e: 'branch'): void
}>()

function elapsedFrom(startedAt: number): string {
  return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`
}

const usage = computed<AssistantUsageInfo | undefined>(() => props.message.live_usage ?? props.message.usage)

// 缺数据 → 「—」哨兵。运行时可得的 TTFT 带 △ 软标。
// CHG-015 P3c: ≥1000 折算为「6.0k」风格（mono footer 紧凑可读），<1000 原样整数。
function num(value?: number): string {
  if (value === undefined || value < 0) return '—'
  const v = Math.round(value)
  if (v >= 1000) {
    const k = v / 1000
    // 10k 以上不留小数（28.0k→28k 太长无益），1k–10k 留一位（6.0k）。
    return k >= 10 ? `${Math.round(k)}k` : `${k.toFixed(1)}k`
  }
  return String(v)
}

const ttft = computed(() => {
  const ms = usage.value?.ttft_ms
  return ms === undefined || ms < 0 ? '—' : `${(ms / 1000).toFixed(1)}s`
})

const elapsed = computed(() => {
  if (props.streaming && props.message.started_at_ms) return elapsedFrom(props.message.started_at_ms)
  if (props.message.elapsed_ms) return `${(props.message.elapsed_ms / 1000).toFixed(1)}s`
  return '—'
})

// CHG-015 P3c: in/out token 行，k 折算。格式「↓28 / ↑6.0k」(/thinking 若有再补一段)。
// 全缺 → 「—」(保栅格)。thinking 仅在源字段存在时追加 (claude reasoning token 才有)。
const tokensIO = computed(() => {
  const i = usage.value?.input_tokens
  const o = usage.value?.output_tokens
  const th = usage.value?.thinking_tokens
  if (i === undefined && o === undefined && th === undefined) return '—'
  const parts = [`↓${num(i)}`, `↑${num(o)}`]
  if (th !== undefined && th >= 0) parts.push(`✻${num(th)}`)
  return parts.join(' / ')
})

// CHG-015 P5c: 缓存读为空时不渲染该项（只在 WorkArea 总览显）。footer 仅当确有正值才显。
const cacheReadValue = computed(() => usage.value?.cache_read_tokens)
const hasCacheRead = computed(() => {
  const v = cacheReadValue.value
  return v !== undefined && v > 0
})
const cacheRead = computed(() => num(cacheReadValue.value))
const model = computed(() => props.message.runtime?.model || '—')
const clock = computed(() => {
  const ts = props.message.started_at_ms
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
})
</script>

<template>
  <div class="v6-rmeta" data-testid="assistant-usage-footer">
    <span class="v6-rmeta__t">
      <span title="TTFT 仅运行时可得">TTFT {{ ttft }}<i class="v6-rmeta__vol">△</i></span>
      <span>总耗时 {{ elapsed }}</span>
      <span>{{ tokensIO }}</span>
      <span v-if="hasCacheRead">缓存读 {{ cacheRead }}</span>
      <span>{{ model }}</span>
      <span>{{ clock }}</span>
    </span>
    <span v-if="props.actionable" class="v6-rmeta__acts">
      <button type="button" @click="emit('copy')">⧉ 复制</button>
      <button type="button" @click="emit('retry')">⟳ 重试</button>
      <button type="button" @click="emit('project')">⤴ 投影</button>
      <button type="button" @click="emit('branch')">⑂ 分支</button>
    </span>
  </div>
</template>

<style scoped>
.v6-rmeta {
  display: flex;
  align-items: center;
  margin-top: 8px;
  font-family: var(--dw-mono);
  font-size: 10.5px;
  color: var(--dw-mu);
  min-height: 22px;
}
.v6-rmeta__t { display: inline; }
.v6-rmeta__t span + span::before {
  content: '·';
  margin: 0 6px;
  opacity: 0.45;
}
.v6-rmeta__vol {
  opacity: 0.6;
  font-size: 8px;
  vertical-align: 3px;
  margin-left: 1px;
  font-style: normal;
}
.v6-rmeta__acts {
  display: none;
  gap: 2px;
  margin-left: 12px;
}
.v6-rmeta:hover .v6-rmeta__acts { display: flex; }
.v6-rmeta__acts button {
  padding: 2px 8px;
  border-radius: var(--dw-r);
  color: var(--dw-mu);
  font-size: 10.5px;
  font-family: var(--dw-font);
  border: 0;
  background: transparent;
  cursor: pointer;
}
.v6-rmeta__acts button:hover { background: var(--dw-sf2); color: var(--dw-fg); }
</style>
