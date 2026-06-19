<script setup lang="ts">
// SessionOverviewPane — shared, host-agnostic single-session overview CANVAS (SSOT).
//
// PURE PRESENTATIONAL. It receives the metrics bag as props ({detail, summary,
// turns, loading}) and renders 运行状态 + Tokens·性能 exactly like pro's
// OverviewPanel.vue. It does NO data fetching, has NO portal bus / pro store
// dependency — the host (pro portal OR deepwork-terminal drawer) owns the fetch
// and feeds this canvas. The derived-metric + formatter logic is ported VERBATIM
// in behavior from pro's OverviewPanel so the rendered UX is byte-identical.
//
// 数据诚实 (红线): every nil/undefined metric → renders「—」(honest unknown),
// never a fabricated 0. `0` is only shown when the host reported a real zero.
import { computed, ref } from 'vue'
import { Activity, Clock, MessageSquare, Cpu, Hash, Snowflake, Copy, Check } from 'lucide-vue-next'
import { createTrace, createLogger } from '@ce/utils/obs'
import type { SessionDetail, TurnsSummary, Turn, UnitPrice } from '@ce/types/sessionMetrics'

interface Props {
  /** 会话详情 (状态/模型/turn_count/ended_at)。null → 空态。 */
  detail?: SessionDetail | null
  /** 会话级聚合 (tokens/性能/费用)。null → 各列「—」。 */
  summary?: TurnsSummary | null
  /** 逐轮 usage (TPS/TTFT 派生 + summary 缺失时的退回聚合源)。 */
  turns?: Turn[]
  /** 当前模型标定单价 (per-MTok)。null/未知模型 →「标定价格」行显「—」(诚实)。 */
  price?: UnitPrice | null
  /** 加载态 (host 拉取中)。 */
  loading?: boolean
  /** 工作目录 (可选; 给则渲染「工作目录」行 + 复制钮)。 */
  rootDir?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  detail: null,
  summary: null,
  turns: () => [],
  price: null,
  loading: false,
  rootDir: null,
})

const log = createLogger('SessionOverviewPane')

const detail = computed(() => props.detail)
const summary = computed(() => props.summary)
const turns = computed<Turn[]>(() => props.turns ?? [])

// 有数据源 = 有 detail (host 已喂入)。无 → 空态门。
const hasSource = computed(() => detail.value != null)

const isEnded = computed(() => {
  const d = detail.value
  if (!d) return false
  return d.active === false || !!d.ended_at
})

const statusLabel = computed(() => {
  if (!detail.value) return '—'
  return isEnded.value ? '已结束' : '运行中'
})

// 耗时 = 会话累计 turn duration 和 (真源: turns.duration_ms)。无任一 turn 携带
// duration → 显「—」(诚实)。
const elapsed = computed(() => {
  let any = false
  let totalMs = 0
  for (const t of turns.value) {
    if (typeof t.duration_ms === 'number' && t.duration_ms > 0) { any = true; totalMs += t.duration_ms }
  }
  if (!any) return '—'
  const sec = Math.max(0, Math.floor(totalMs / 1000))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
})

// ── TOKENS · 性能 aggregate (honest: NULL columns → null → render「—」) ──
// 优先用后端 summary 段 (权威, 守住 nil==unknown / 0==真实零); summary 缺失时退回
// 前端逐 turn 聚合, 保持向后兼容。
type TurnNumKey = 'input_tokens' | 'output_tokens' | 'cache_read_tokens' | 'cache_create_tokens' | 'tool_calls' | 'agent_calls' | 'tool_errors' | 'model_calls' | 'permission_requests'
function sumMetric(key: TurnNumKey): number | null {
  const s = summary.value
  if (s) { const v = s[key]; return (v === null || v === undefined) ? null : v }
  let any = false
  let total = 0
  for (const t of turns.value) {
    const v = t[key]
    if (v !== null && v !== undefined) { any = true; total += v }
  }
  return any ? total : null
}
const inTokens = computed(() => sumMetric('input_tokens'))
const outTokens = computed(() => sumMetric('output_tokens'))
const cacheTokens = computed(() => sumMetric('cache_read_tokens'))
const cacheCreateTokens = computed(() => sumMetric('cache_create_tokens'))
const toolCalls = computed(() => sumMetric('tool_calls'))
const agentCalls = computed(() => sumMetric('agent_calls'))
const toolErrors = computed(() => sumMetric('tool_errors'))
const modelCalls = computed(() => sumMetric('model_calls'))
const permissionRequests = computed(() => sumMetric('permission_requests'))

// 缓存命中率 (前端派生, 无后端列): = cache_read / (input + cache_read + cache_create)。
// 分母 0 或任一源缺失 → null →「—」(诚实)。
const cacheHitRate = computed<number | null>(() => {
  const cr = cacheTokens.value
  const ci = inTokens.value
  const cc = cacheCreateTokens.value
  if (cr === null && ci === null && cc === null) return null
  const denom = (ci ?? 0) + (cr ?? 0) + (cc ?? 0)
  if (denom <= 0) return null
  return (cr ?? 0) / denom
})

// 工具错误率 = tool_errors / tool_calls。无工具调用 (分母 0) 或缺源 → null →「—」。
const toolErrorRate = computed<number | null>(() => {
  const errs = toolErrors.value
  const calls = toolCalls.value
  if (errs === null || calls === null) return null
  if (calls <= 0) return null
  return errs / calls
})

// 工具分类计数 (读/改/执行): 优先后端 summary 合并段; 退回前端逐 turn 合并。
// 无任一 turn 携带 → null → 整组不显 (诚实)。
const toolCategoryCounts = computed<Record<string, number> | null>(() => {
  const s = summary.value
  if (s && s.tool_calls_by_category) return s.tool_calls_by_category
  let any = false
  const acc: Record<string, number> = {}
  for (const t of turns.value) {
    const cat = t.tool_calls_by_category
    if (cat) {
      any = true
      for (const k of Object.keys(cat)) acc[k] = (acc[k] ?? 0) + cat[k]
    }
  }
  return any ? acc : null
})
const toolCatRead = computed<number | null>(() => toolCategoryCounts.value?.read ?? (toolCategoryCounts.value ? 0 : null))
const toolCatEdit = computed<number | null>(() => toolCategoryCounts.value?.edit ?? (toolCategoryCounts.value ? 0 : null))
const toolCatBash = computed<number | null>(() => toolCategoryCounts.value?.bash ?? (toolCategoryCounts.value ? 0 : null))
const totalTokens = computed<number | null>(() => {
  const parts = [inTokens.value, outTokens.value, cacheTokens.value, cacheCreateTokens.value]
  if (parts.every((p) => p === null)) return null
  return parts.reduce<number>((acc, p) => acc + (p ?? 0), 0)
})
// 用户 prompt 数 = summary.user_prompts (后端: 非空 user_input 的 turn 数); 退回前端计数。
const userPrompts = computed<number | null>(() => {
  if (summary.value) return summary.value.user_prompts ?? 0
  if (!turns.value.length) return null
  return turns.value.filter((t) => (t.user_input ?? '').trim() !== '').length
})
// 开始时间 = summary.started_at (最早 turn created_at); 无 →「—」。
const startedAt = computed<string | null>(() => summary.value?.started_at ?? null)
// 费用 = summary.total_cost (后端按价表派生; 无价/无 model → null →「—」, 绝不蒙)。
const totalCost = computed<number | null>(() => summary.value?.total_cost ?? null)
const costCurrency = computed<string>(() => summary.value?.currency ?? '')
// 标定价格 = 当前模型的 per-MTok 单价 (后端 kit/pricing SSOT)。未知模型 → null →「—」。
const unitPrice = computed<UnitPrice | null>(() => props.price ?? null)
const ttftLatest = computed<number | null>(() => {
  for (let i = turns.value.length - 1; i >= 0; i--) {
    const v = turns.value[i].ttft_ms
    if (v !== null && v !== undefined) return v
  }
  return null
})

// R3: 输出阶段 TPS — 生成段速度 (wall-clock, 含每轮开销)。
// 公式 = output_tokens / ((duration_ms - ttft_ms) / 1000)，逐轮汇总:
//   生成段毫秒 = Σ(duration_ms - ttft_ms)，仅取 duration/ttft/output 三者俱全且
//   duration>ttft 的 turn (诚实: 缺任一源 → 不计入)。无任何可计 turn → null →「—」。
const outputTps = computed<number | null>(() => {
  let genMs = 0
  let outTok = 0
  let any = false
  for (const t of turns.value) {
    const d = t.duration_ms
    const ttft = t.ttft_ms
    const o = t.output_tokens
    if (typeof d !== 'number' || typeof ttft !== 'number' || typeof o !== 'number') continue
    if (o <= 0) continue
    const gen = d - ttft
    if (gen <= 0) continue
    genMs += gen
    outTok += o
    any = true
  }
  if (!any || genMs <= 0) return null
  return outTok / (genMs / 1000)
})

// 真·Model TPS — 纯模型生成速度 (首 token→末 token 输出窗口, 不含每轮开销)。
// 公式 = Σoutput_tokens / (Σoutput_window_ms / 1000)。优先后端 summary (权威);
// 缺失时退回逐 turn 聚合。无任何窗口 (codex / 非 PTY) → null →「—」。
// 合理性钳: 当前所有 runtime 峰值解码 < ~600 tok/s。超此 = 窗口测量伪影 → 显「—」。
const MODEL_TPS_PLAUSIBLE_MAX = 600
function plausibleTps(v: number | null): number | null {
  return v != null && v > 0 && v <= MODEL_TPS_PLAUSIBLE_MAX ? v : null
}
const modelTps = computed<number | null>(() => {
  const s = summary.value
  if (s) {
    const win = s.output_window_ms
    const tok = s.output_tokens
    if (win == null || tok == null || win <= 0 || tok <= 0) return null
    return plausibleTps(tok / (win / 1000))
  }
  let winMs = 0
  let outTok = 0
  let any = false
  for (const t of turns.value) {
    const w = t.output_window_ms
    const o = t.output_tokens
    if (typeof w !== 'number' || typeof o !== 'number') continue
    if (w <= 0 || o <= 0) continue
    winMs += w
    outTok += o
    any = true
  }
  if (!any || winMs <= 0) return null
  return plausibleTps(outTok / (winMs / 1000))
})
function fmtTok(n: number | null): string {
  if (n === null) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}
function fmtMs(n: number | null): string {
  return n === null ? '—' : `${(n / 1000).toFixed(1)}s`
}
function fmtTps(n: number | null): string {
  return n === null ? '—' : `${n.toFixed(1)} tok/s`
}
function fmtCount(n: number | null): string {
  return n === null ? '—' : String(n)
}
// 比率 → 百分比, 一位小数。null →「—」(诚实, 不补 0%)。
function fmtPct(n: number | null): string {
  return n === null ? '—' : `${(n * 100).toFixed(1)}%`
}
function fmtCost(n: number | null, currency: string): string {
  if (n === null) return '—'
  const sym = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : ''
  return `${sym}${n.toFixed(n < 1 ? 4 : 2)}`
}
// 标定价格 → 一行 per-MTok 单价: `IN $5 · OUT $25 · 写5m $6.25 · 写1h $10 · 读 $0.5 /M`。
// 无价对象 →「—」。无 cache-write 档 (写5m=写1h=0, 如 OpenAI/Gemini) → 省略「写*」段 (诚实)。
function fmtUnitPrice(p: UnitPrice | null): string {
  if (!p) return '—'
  const sym = p.currency === 'CNY' ? '¥' : p.currency === 'USD' ? '$' : ''
  const num = (v: number): string => `${sym}${Number(v.toFixed(4))}`
  const segs = [`IN ${num(p.input)}`, `OUT ${num(p.output)}`]
  if (p.cache_write_5m > 0) segs.push(`写5m ${num(p.cache_write_5m)}`)
  if (p.cache_write_1h > 0) segs.push(`写1h ${num(p.cache_write_1h)}`)
  segs.push(`读 ${num(p.cache_read)}`)
  return `${segs.join(' · ')} /M`
}
function fmtStarted(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// 工作目录路径常被 truncate 截断且不可复制 → 一键复制全路径 (仅 rootDir 给定时显示)。
const copiedDir = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null
async function copyRootDir(): Promise<void> {
  if (!props.rootDir) return
  try {
    await navigator.clipboard.writeText(props.rootDir)
    copiedDir.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => { copiedDir.value = false }, 1500)
  } catch (e) {
    log.warn('copy rootDir failed', { error: String(e) }, createTrace('SessionOverviewPane/copy'))
  }
}
</script>

<template>
  <div class="h-full overflow-auto p-4" data-testid="session-overview-pane">
    <!-- 无会话空态 (host 未喂入 detail) -->
    <div v-if="!hasSource" class="flex flex-col items-center justify-center h-full gap-3 text-center text-muted-foreground">
      <Activity class="size-10 opacity-30" />
      <div>
        <p v-if="loading" class="text-sm font-medium animate-pulse">加载中…</p>
        <template v-else>
          <p class="text-sm font-medium">尚无活动会话</p>
          <p class="text-xs mt-1">发起会话后，运行状态与指标将显示在这里</p>
        </template>
      </div>
    </div>

    <template v-else>
      <!-- 终态摘要卡 (冻结) -->
      <div v-if="isEnded" class="mb-4 rounded-lg border border-border bg-muted/40 p-3" data-testid="overview-frozen">
        <div class="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <Snowflake class="size-3.5" />
          会话已结束 — 冻结为终态摘要
        </div>
        <div class="flex flex-wrap gap-4 text-sm">
          <div><span class="text-muted-foreground">总耗时</span> <b class="font-mono">{{ elapsed }}</b></div>
          <div><span class="text-muted-foreground">Turn</span> <b class="font-mono">{{ detail?.turn_count ?? 0 }}</b></div>
        </div>
        <p v-if="detail?.summary" class="mt-2 text-xs text-muted-foreground">{{ detail.summary }}</p>
      </div>

      <!-- RUNTIME 区 -->
      <div class="ov-label">运行状态</div>
      <div class="ov-rows">
        <div class="ov-row">
          <span class="ov-key"><Activity class="size-3.5" /> 状态</span>
          <b :class="isEnded ? 'text-muted-foreground' : 'text-primary'">{{ statusLabel }}</b>
        </div>
        <div class="ov-row">
          <span class="ov-key"><Clock class="size-3.5" /> 耗时</span>
          <span class="font-mono text-xs">{{ elapsed }}</span>
        </div>
        <div class="ov-row">
          <span class="ov-key"><MessageSquare class="size-3.5" /> Turn 数</span>
          <span class="font-mono text-xs">{{ detail?.turn_count ?? 0 }}</span>
        </div>
        <div class="ov-row">
          <span class="ov-key"><MessageSquare class="size-3.5" /> 用户输入</span>
          <span class="font-mono text-xs">{{ fmtCount(userPrompts) }}</span>
        </div>
        <div class="ov-row">
          <span class="ov-key"><Clock class="size-3.5" /> 开始时间</span>
          <span class="font-mono text-xs">{{ fmtStarted(startedAt) }}</span>
        </div>
        <div class="ov-row">
          <span class="ov-key"><Cpu class="size-3.5" /> 模型</span>
          <span class="font-mono text-xs truncate max-w-[60%]">{{ detail?.model_id || '—' }}</span>
        </div>
        <div v-if="rootDir" class="ov-row">
          <span class="ov-key"><Hash class="size-3.5" /> 工作目录</span>
          <span class="ov-dir">
            <span class="font-mono text-[11px] truncate" :title="rootDir">{{ rootDir }}</span>
            <button
              type="button"
              class="ov-dir-copy"
              :title="copiedDir ? '已复制' : '复制完整路径'"
              :aria-label="copiedDir ? '已复制' : '复制工作目录路径'"
              data-testid="overview-rootdir-copy"
              @click="copyRootDir"
            >
              <Check v-if="copiedDir" class="size-3" />
              <Copy v-else class="size-3" />
            </button>
          </span>
        </div>
      </div>

      <!-- TOKENS · 性能 — 由 turns 表 summary 聚合 (NULL 列诚实显「—」) -->
      <div class="ov-label mt-4">Tokens · 性能</div>
      <div class="ov-rows" data-testid="overview-metrics">
        <div class="ov-row">
          <span class="ov-key">输入 ↓ / 输出 ↑</span>
          <span class="font-mono text-xs">{{ fmtTok(inTokens) }} / {{ fmtTok(outTokens) }}</span>
        </div>
        <div class="ov-row">
          <span class="ov-key">总 Tokens</span>
          <span class="font-mono text-xs">{{ fmtTok(totalTokens) }}</span>
        </div>
        <div class="ov-row">
          <span class="ov-key">缓存读</span>
          <span class="font-mono text-xs" style="color:var(--dw-ok)">{{ fmtTok(cacheTokens) }}</span>
        </div>
        <div class="ov-row">
          <span class="ov-key">缓存写</span>
          <span class="font-mono text-xs">{{ fmtTok(cacheCreateTokens) }}</span>
        </div>
        <div class="ov-row">
          <span class="ov-key">缓存命中率</span>
          <span class="font-mono text-xs" data-testid="overview-cache-hit-rate" style="color:var(--dw-ok)">{{ fmtPct(cacheHitRate) }}</span>
        </div>
        <div class="ov-row">
          <span class="ov-key">费用</span>
          <span class="font-mono text-xs" data-testid="overview-cost">{{ fmtCost(totalCost, costCurrency) }}</span>
        </div>
        <!-- 标定价格 has 5 per-MTok segments; on a narrow drawer they don't fit one line.
             Stack the row (key on top) and let the value WRAP across the full width instead of
             truncating — reads top-to-bottom, shows every segment, costs ~2 lines not 5. -->
        <div class="ov-row ov-row--price">
          <span class="ov-key">标定价格</span>
          <span class="ov-price font-mono text-[11px] text-muted-foreground" data-testid="overview-unit-price">{{ fmtUnitPrice(unitPrice) }}</span>
        </div>
        <div class="ov-row">
          <span class="ov-key">模型调用</span>
          <span class="font-mono text-xs" data-testid="overview-model-calls">{{ fmtCount(modelCalls) }}</span>
        </div>
        <div class="ov-row">
          <span class="ov-key">工具调用</span>
          <span class="font-mono text-xs">{{ fmtCount(toolCalls) }}</span>
        </div>
        <div v-if="toolCategoryCounts" class="ov-row">
          <span class="ov-key">工具分类 (读/改/执行)</span>
          <span class="font-mono text-xs" data-testid="overview-tool-categories">{{ fmtCount(toolCatRead) }} / {{ fmtCount(toolCatEdit) }} / {{ fmtCount(toolCatBash) }}</span>
        </div>
        <div class="ov-row">
          <span class="ov-key">工具错误率</span>
          <span class="font-mono text-xs" data-testid="overview-tool-error-rate">{{ fmtPct(toolErrorRate) }}</span>
        </div>
        <div class="ov-row">
          <span class="ov-key">Agent 调用</span>
          <span class="font-mono text-xs">{{ fmtCount(agentCalls) }}</span>
        </div>
        <div class="ov-row">
          <span class="ov-key">授权请求</span>
          <span class="font-mono text-xs" data-testid="overview-permission-requests">{{ fmtCount(permissionRequests) }}</span>
        </div>
        <div class="ov-row">
          <span class="ov-key">TTFT</span>
          <span class="font-mono text-xs">{{ fmtMs(ttftLatest) }}</span>
        </div>
        <div class="ov-row">
          <span class="ov-key">输出阶段 TPS</span>
          <span class="font-mono text-xs" data-testid="overview-output-tps">{{ fmtTps(outputTps) }}</span>
        </div>
        <div class="ov-row">
          <span class="ov-key">Model TPS</span>
          <span class="font-mono text-xs" data-testid="overview-model-tps">{{ fmtTps(modelTps) }}</span>
        </div>
      </div>
      <p class="mt-1.5 text-[10px] text-muted-foreground/80 font-mono">
        指标由 turns 表逐轮 usage 持久化后聚合; 某轮未上报 → 该列显「—」(诚实, 不补 0)。
        费用按模型价表派生, 无价模型不显费用。
      </p>

      <p class="mt-3 text-[10px] text-muted-foreground/70 font-mono">已暂停/已结束会话：此面板冻结为终态摘要。</p>

      <p v-if="loading" class="mt-3 text-xs text-muted-foreground animate-pulse">加载中…</p>
    </template>
  </div>
</template>

<style scoped>
.ov-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
  padding-bottom: 6px;
}
.ov-rows { display: flex; flex-direction: column; }
.ov-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 0;
  font-size: 13px;
  border-bottom: 1px solid hsl(var(--border) / 0.4);
}
.ov-key { display: flex; align-items: center; gap: 6px; color: hsl(var(--muted-foreground)); }
/* 标定价格行: 堆叠 — key 在上, 价格整行换行 (不截断, 显示全 5 段单价)。 */
.ov-row--price { flex-direction: column; align-items: flex-start; gap: 3px; }
.ov-row--price .ov-price { align-self: stretch; white-space: normal; word-break: break-word; line-height: 1.5; }
/* 工作目录值 = 截断路径 + 复制钮。max-width 限 60% (与 model_id 行一致),
   min-width:0 让内部 truncate 生效。 */
.ov-dir { display: flex; align-items: center; gap: 5px; max-width: 60%; min-width: 0; }
.ov-dir > .truncate { min-width: 0; }
.ov-dir-copy {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border-radius: 3px;
  color: hsl(var(--muted-foreground));
  transition: color 0.12s, background 0.12s;
}
.ov-dir-copy:hover { color: var(--dw-fg); background: var(--dw-sf2); }
</style>
