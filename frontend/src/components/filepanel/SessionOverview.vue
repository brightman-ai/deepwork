<script setup lang="ts">
// SessionOverview — the shared "会话总览" tab content (SSOT). Renders durable session
// facts (model/runtime/effort, turn count, token usage, start time, elapsed, state) from
// plain props, so every host — terminal drawer, ws-portal WorkArea, share panel — feeds
// it whatever it knows and the UI stays identical. Unknown fields are omitted (honest: no
// "—" clutter for facts a given host can't provide). It carries NO endpoint/auth knowledge.
import { computed } from 'vue'
import type { SessionOverviewData } from './types'

const props = defineProps<SessionOverviewData>()

function fmtNum(n?: number): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
function fmtDuration(ms: number): string {
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
const startedLabel = computed(() => {
  if (!props.startedAt) return undefined
  const d = new Date(props.startedAt)
  if (isNaN(d.getTime())) return undefined
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
})
const elapsedLabel = computed(() => {
  if (props.elapsedMs != null) return fmtDuration(props.elapsedMs)
  if (props.startedAt) {
    const t = new Date(props.startedAt).getTime()
    if (!isNaN(t)) return fmtDuration(Math.max(0, Date.now() - t))
  }
  return undefined
})

// Only rows with a value render (honest: omit what the host didn't provide).
const rows = computed(() => {
  const r: { k: string; v: string; mono?: boolean }[] = []
  if (props.state) r.push({ k: '状态', v: props.state })
  if (elapsedLabel.value) r.push({ k: '耗时', v: elapsedLabel.value, mono: true })
  if (props.turns != null) r.push({ k: 'Turn 数', v: String(props.turns) })
  if (props.userInputs != null) r.push({ k: '用户输入', v: String(props.userInputs) })
  if (startedLabel.value) r.push({ k: '开始时间', v: startedLabel.value, mono: true })
  if (props.model || props.runtime) r.push({ k: '模型', v: props.model || props.runtime || '', mono: true })
  if (props.effort) r.push({ k: '力度', v: props.effort, mono: true })
  return r
})
const tokenRows = computed(() => {
  const r: { k: string; v: string }[] = []
  if (props.inputTokens != null) r.push({ k: '输入', v: fmtNum(props.inputTokens) })
  if (props.outputTokens != null) r.push({ k: '输出', v: fmtNum(props.outputTokens) })
  if (props.cacheReadTokens != null) r.push({ k: '缓存读', v: fmtNum(props.cacheReadTokens) })
  return r
})
</script>

<template>
  <div class="so" data-testid="session-overview">
    <div v-if="title" class="so-title" :title="title">{{ title }}</div>
    <template v-if="rows.length">
      <div class="so-sec">运行概览</div>
      <div v-for="r in rows" :key="r.k" class="so-row">
        <span class="so-k">{{ r.k }}</span>
        <span class="so-v" :class="{ 'is-mono': r.mono }">{{ r.v }}</span>
      </div>
    </template>
    <template v-if="tokenRows.length">
      <div class="so-sec">Token 用量</div>
      <div v-for="r in tokenRows" :key="r.k" class="so-row">
        <span class="so-k">{{ r.k }}</span>
        <span class="so-v is-mono">{{ r.v }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.so { display: flex; flex-direction: column; height: 100%; overflow-y: auto; padding: 12px; gap: 2px; }
.so-title { font-size: 13px; font-weight: 600; color: var(--dw-fg, hsl(var(--foreground))); margin-bottom: 8px; line-height: 1.4; }
.so-sec { font-family: var(--dw-mono, monospace); font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--dw-mu, hsl(var(--muted-foreground))); margin: 12px 0 4px; }
.so-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 5px 0; border-bottom: 1px solid var(--dw-bd, hsl(var(--border))); }
.so-k { font-size: 12px; color: var(--dw-mu, hsl(var(--muted-foreground))); flex-shrink: 0; }
.so-v { font-size: 12px; color: var(--dw-fg, hsl(var(--foreground))); text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.so-v.is-mono { font-family: var(--dw-mono, monospace); font-size: 11px; }
</style>
