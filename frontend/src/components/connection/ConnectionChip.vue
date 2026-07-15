<template>
  <!-- 规范连接态 chip (SSOT, @ce): 紧凑内联 = 状态点 + (非连接态文案) + RTT + 实时 ↓↑ 速率;
       tap 展开完整详情 popover (目标/RTT/连接时长/实时+累计流量)。断线时内联出「刷新」钮
       (refreshable), 点击 emit refresh —— 让"卡住的断线"不是死胡同。
       主题无关: 所有非语义色 (popover/文案) 走 CSS 变量 + 中性回退, 由宿主主题驱动;
       状态点色是语义色 (绿/黄/橙/红), 各宿主一致。 -->
  <div
    ref="chipEl"
    class="conn-chip" :class="[`is-${state}`, { clickable: hasDetail }]"
    :data-testid="`${testidPrefix}-status`"
    :title="targetLabel ? `连接目标: ${targetLabel}` : undefined"
    @click="onChipClick"
  >
    <span class="conn-dot" />
    <span v-if="state !== 'connected'" class="conn-text">{{ stateText }}</span>

    <!-- R2 刷新钮: 断线/重连停滞时的人工重连出口。@click.stop 不触发详情 popover。 -->
    <button
      v-if="refreshable && (state === 'disconnected' || state === 'reconnecting')"
      class="conn-refresh" type="button" :data-testid="`${testidPrefix}-refresh`"
      title="重新连接" aria-label="重新连接"
      @click.stop="emit('refresh')"
    >
      <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
        <path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"
          d="M20 11a8 8 0 1 0-.9 4.5" />
        <path fill="currentColor" d="M20 4.5v5h-5z" />
      </svg>
    </button>

    <!-- 连接失败的分类原因 (远端 peer): 非侵入 ⓘ, 点开看原因, 别让 "Connecting…" 卡成死胡同。 -->
    <button
      v-if="diagnostic && state !== 'connected'"
      class="conn-diag" type="button" :data-testid="`${testidPrefix}-diagnostic`"
      :title="diagnostic" @click.stop="popOpen = !popOpen"
    >ⓘ</button>

    <template v-if="state === 'connected'">
      <span v-if="safeRtt > 0" class="conn-stat conn-rtt" :class="rttClass">{{ safeRtt }}ms</span>
      <!-- 内联吞吐可选 (inlineThroughput): 稀疏/突发流量 (如 SSE, 多数秒为 0) 下逐秒的
           ↓↑ span 忽隐忽现会让 chip 宽度跳变闪烁 —— 这类连接关掉它, 只留稳定的 RTT,
           吞吐详情仍在 tap popover 里。持续流量 (如终端 WS) 可开着。 -->
      <span class="conn-stat conn-speed" v-if="showInlineRate">
        <span class="bw-down">{{ formatRate(safeDownBps) }}</span>
        <span class="bw-up">{{ formatRate(safeUpBps) }}</span>
      </span>
    </template>

    <!-- 详情 popover: Teleport 到 body + 按 chip 的屏幕坐标 fixed 定位, 逃逸任何宿主顶栏的
         overflow 裁剪 (album 顶栏会裁, 容器内 absolute 会被切没)。backdrop 外点关。 -->
    <Teleport to="body">
      <template v-if="popOpen">
        <div class="conn-pop-backdrop" @click="popOpen = false" />
        <div v-if="diagnostic && state !== 'connected'" class="conn-pop conn-pop--diag" :style="popStyle" :data-testid="`${testidPrefix}-diag-pop`" @click.stop>
          <div class="conn-pop-diag-title">连不上？可能原因</div>
          <div class="conn-pop-diag-reason">{{ diagnostic }}</div>
          <div v-if="targetLabel" class="conn-pop-row"><span>目标</span><span>{{ targetLabel }}</span></div>
          <button v-if="refreshable" class="conn-pop-retry" type="button" @click.stop="emit('refresh'); popOpen = false">重新连接</button>
        </div>
        <div v-else class="conn-pop" :style="popStyle" :data-testid="`${testidPrefix}-pop`" @click.stop>
          <div class="conn-pop-row"><span>状态</span><span :class="stateClass">{{ stateText }}</span></div>
          <div v-if="targetLabel" class="conn-pop-row"><span>目标</span><span>{{ targetLabel }}</span></div>
          <div class="conn-pop-row"><span>延迟 RTT</span><span :class="rttClass">{{ safeRtt > 0 ? safeRtt + ' ms' : '—' }}</span></div>
          <div class="conn-pop-row"><span>连接时长</span><span>{{ safeUptime > 0 ? formatDuration(safeUptime) : '—' }}</span></div>
          <div class="conn-pop-sep" />
          <div class="conn-pop-row"><span>实时 ↓ / ↑</span><span>{{ formatRate(safeDownBps) }} / {{ formatRate(safeUpBps) }}</span></div>
          <div class="conn-pop-row"><span>累计 ↓ 下行</span><span>{{ formatBytes(safeRxTotal) }}</span></div>
          <div class="conn-pop-row"><span>累计 ↑ 上行</span><span>{{ formatBytes(safeTxTotal) }}</span></div>
          <button v-if="refreshable && state !== 'connected'" class="conn-pop-retry" type="button" @click.stop="emit('refresh'); popOpen = false">重新连接</button>
        </div>
      </template>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ConnectionState } from './types'

const popOpen = ref(false)
const chipEl = ref<HTMLElement | null>(null)
const popStyle = ref<Record<string, string>>({})

/** 打开时按 chip 屏幕坐标把 popover 定到其正下方右对齐 (fixed, Teleport 到 body 后不受宿主裁剪)。 */
function positionPop() {
  const el = chipEl.value
  if (!el) return
  const r = el.getBoundingClientRect()
  popStyle.value = {
    position: 'fixed',
    top: `${Math.round(r.bottom + 6)}px`,
    right: `${Math.round(window.innerWidth - r.right)}px`,
  }
}
function onChipClick() {
  if (!hasDetail.value) return
  popOpen.value = !popOpen.value
  if (popOpen.value) positionPop()
}

const props = defineProps<{
  state: ConnectionState
  rtt?: number
  uploadBps?: number
  downloadBps?: number
  /** 当前连接累计发送/接收字节 */
  txTotal?: number
  rxTotal?: number
  /** 当前连接已连通的秒数 */
  uptimeSec?: number
  /** 本条连接的人类可读端点标签 */
  targetLabel?: string
  /** 失败连接的分类原因 (远端 peer), 经 ⓘ 展示 */
  diagnostic?: string
  /** 断线时是否给出「刷新」重连钮 (R2)。默认 false —— 由能重连的宿主显式开启 */
  refreshable?: boolean
  /** 内联是否显示 ↓↑ 吞吐 (默认 true)。稀疏/突发流量的连接 (如 SSE) 应传 false 避免逐秒
   *  span 忽隐忽现导致宽度跳变闪烁 —— 只留稳定 RTT, 吞吐仍在 tap popover 里。 */
  inlineThroughput?: boolean
  /** data-testid 前缀 (默认 'connection'; 宿主可传自己的命名空间保持既有测试契约) */
  testidPrefix?: string
  /** 覆盖各连接态的内联显示文案 (默认中文)。宿主可传自己的本地化文案 (如终端英文
   *  Connecting…/Disconnected/Taken over)。只覆盖传入的键, 其余回退默认中文。 */
  labels?: Partial<Record<ConnectionState, string>>
}>()

const emit = defineEmits<{ refresh: [] }>()

const testidPrefix = computed(() => props.testidPrefix ?? 'connection')
const safeRtt = computed(() => props.rtt ?? 0)
const safeDownBps = computed(() => props.downloadBps ?? 0)
const safeUpBps = computed(() => props.uploadBps ?? 0)
const safeTxTotal = computed(() => props.txTotal ?? 0)
const safeRxTotal = computed(() => props.rxTotal ?? 0)
const safeUptime = computed(() => props.uptimeSec ?? 0)
// 内联吞吐: 仅当宿主允许 (默认 true) 且这一秒确有流量时显示。稀疏流量宿主传 inlineThroughput=false
// 彻底关掉, 避免逐秒 0↔非0 切换让 chip 宽度跳变。
const showInlineRate = computed(() => (props.inlineThroughput ?? true) && (safeDownBps.value > 0 || safeUpBps.value > 0))
const stateClass = computed(() => `st-${props.state}`)
// 连上才有可 tap 的详情 (含流量/时长); 断线只有 diagnostic 时也允许点开看原因。
const hasDetail = computed(() => props.state === 'connected' || !!props.diagnostic)

// 断线且不再有详情/诊断可看时, 关掉可能残留的 popover (但保留失败诊断的 ⓘ popover)。
watch(() => props.state, (s) => { if (s !== 'connected' && !props.diagnostic) popOpen.value = false })

// 默认中文文案 (SSOT 内置)。宿主经 labels prop 覆盖任意键做本地化, 未覆盖的回退这里。
const DEFAULT_LABELS: Record<ConnectionState, string> = {
  connecting: '连接中…',
  connected: '已连接',
  disconnected: '已断开',
  reconnecting: '重连中…',
  preempted: '已被接管',
}
const stateText = computed(() => props.labels?.[props.state] ?? DEFAULT_LABELS[props.state] ?? props.state)

const rttClass = computed(() => {
  const r = safeRtt.value
  if (r < 50) return 'rtt-good'
  if (r < 150) return 'rtt-ok'
  return 'rtt-bad'
})

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}K`
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)}M`
  return `${(bytes / 1073741824).toFixed(2)}G`
}

/** 实时吞吐, 紧凑每秒速率, 如 1.2K/s。 */
function formatRate(bps: number): string {
  return `${formatBytes(bps)}/s`
}

/** 紧凑时长: 45s · 5m · 1h20m。 */
function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return m > 0 ? `${h}h${m}m` : `${h}h`
}
</script>

<style scoped>
.conn-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 10px;
  font-size: 0.68rem;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  flex-shrink: 0;
  line-height: 1;
}
.conn-chip.clickable { cursor: pointer; }
.conn-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
/* 状态点 = 语义色 (各宿主一致, 不走主题变量) */
.is-connected .conn-dot { background: #4caf50; }
.is-connecting .conn-dot { background: #ffc107; animation: conn-pulse 1s infinite; }
.is-reconnecting .conn-dot { background: #ff9800; animation: conn-pulse 1s infinite; }
.is-disconnected .conn-dot { background: #f44336; }
.is-preempted .conn-dot { background: #ff5722; animation: conn-pulse 1s infinite; }
.is-connected { background: rgba(76,175,80,0.08); color: #4caf50; }
.is-connecting { background: rgba(255,193,7,0.08); color: #ffc107; }
.is-reconnecting { background: rgba(255,152,0,0.08); color: #ff9800; }
.is-disconnected { background: rgba(244,67,54,0.08); color: #f44336; }
.is-preempted { background: rgba(255,87,34,0.08); color: #ff5722; }
.st-connected { color: #4caf50; }
.st-connecting { color: #ffc107; }
.st-reconnecting, .st-preempted { color: #ff9800; }
.st-disconnected { color: #f44336; }

.conn-text { font-weight: 600; }
.conn-stat { font-size: 0.62rem; opacity: 0.8; }
.conn-rtt { font-weight: 600; }
.rtt-good { color: #4caf50; }
.rtt-ok { color: #ffc107; }
.rtt-bad { color: #f44336; }

.conn-speed { display: inline-flex; gap: 3px; opacity: 0.9; }
.bw-down::before { content: "\2193"; font-size: 0.58rem; }
.bw-up::before { content: "\2191"; font-size: 0.58rem; }

/* R2 刷新钮: 显性 signifier (刷新图标) + affordance (hover 转亮/旋转反馈) */
.conn-refresh {
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; border: none; padding: 0 1px; margin: 0;
  color: currentColor; cursor: pointer; opacity: 0.85; line-height: 0;
}
.conn-refresh:hover { opacity: 1; }
.conn-refresh:hover svg { transform: rotate(-90deg); }
.conn-refresh svg { transition: transform 0.25s ease; }
.conn-refresh:focus-visible { outline: 1.5px solid currentColor; outline-offset: 1px; border-radius: 4px; }

.conn-diag {
  background: transparent; border: none; padding: 0 2px; cursor: pointer;
  color: currentColor; opacity: 0.75; font-size: 0.72rem; line-height: 1;
}
.conn-diag:hover { opacity: 1; }

/* 详情 popover — 主题变量驱动 (宿主 --dw-pop-* 或 --panel3 · --ink 皆可; 给中性回退) */
.conn-pop-backdrop { position: fixed; inset: 0; z-index: 60; }
.conn-pop {
  /* top/right 由内联 popStyle 按 chip 屏幕坐标给 (fixed, Teleport 后逃逸宿主裁剪) */
  position: fixed; z-index: 61;
  min-width: 172px;
  padding: 8px 10px;
  background: var(--dw-pop-bg, var(--panel3, #22232a));
  border: 1px solid var(--dw-pop-border, var(--line2, #3a3b42));
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  color: var(--dw-pop-ink, var(--ink, #e3e4e8));
  cursor: default;
  white-space: nowrap;
}
.conn-pop-row {
  display: flex; align-items: center; justify-content: space-between; gap: 14px;
  padding: 2px 0;
  font-size: 0.66rem;
}
.conn-pop-row > span:first-child { color: var(--dw-pop-muted, var(--ink3, #8a8c93)); }
.conn-pop-row > span:last-child { font-weight: 600; font-variant-numeric: tabular-nums; }
.conn-pop-sep { height: 1px; background: var(--dw-pop-border, var(--line2, #2e2f36)); margin: 5px 0; }
.conn-pop--diag { white-space: normal; max-width: 240px; }
.conn-pop-diag-title { color: #f4b7b7; font-size: 0.66rem; font-weight: 600; margin-bottom: 4px; }
.conn-pop-diag-reason { color: var(--dw-pop-ink, var(--ink, #e9eaee)); font-size: 0.7rem; line-height: 1.5; margin-bottom: 6px; }
.conn-pop-retry {
  width: 100%; margin-top: 7px; padding: 5px 0;
  border: 1px solid var(--acc, #4ea1ff); border-radius: 6px;
  background: var(--acc-soft, rgba(78,161,255,0.14)); color: var(--acc-ink, #7db8ff);
  font-size: 0.68rem; font-weight: 700; cursor: pointer;
}
.conn-pop-retry:hover { filter: brightness(1.12); }

@keyframes conn-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
</style>
