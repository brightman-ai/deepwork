<script setup lang="ts">
/**
 * SessionOverview — host-agnostic "session at a glance" panel (CHG-016, SSOT).
 *
 * Renders the live tmux topology of ONE host process as a scannable overview: a
 * session rollup header (pane / active counts, cwd) plus a row per pane (agent tool
 * + icon, status dot, cwd basename, last-activity). It is deliberately self-contained:
 * the ONLY external dependency is settingsApiFetch (the host injects auth + base), so
 * the terminal renders it today and pro can reuse it verbatim — no useFleet, no pinia,
 * no /api/fleet/* aggregation.
 *
 * Data source: GET /api/tmux/state (agentintel.TmuxState). That snapshot carries
 * per-pane { index, active, title, cwd, agentTool, agentStatus } but NOT model / token
 * counts (those live in the per-session agent_state WS stream, which is host-specific
 * and not host-agnostic). We therefore render what the host-agnostic endpoint truthfully
 * provides and omit model/tokens rather than fabricate them. Refreshes on a ~2s poll.
 */
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { settingsApiFetch } from '@ce/framework/portal'
import { Bot, Terminal as TerminalIcon, FolderOpen, RefreshCw } from 'lucide-vue-next'

const props = defineProps<{ sessionId: string }>()

type AgentTool = 'claude' | 'codex' | 'gemini' | 'opencode' | ''
type AgentStatus = 'none' | 'running' | 'idle' | 'waiting' | 'done'

interface PaneState {
  index: number
  active: boolean
  title?: string
  cwd?: string
  agentTool?: AgentTool
  agentStatus?: AgentStatus
}
interface WindowState {
  index: number
  name: string
  active: boolean
  panes: PaneState[]
}
interface SessionState {
  name: string
  attached: boolean
  windows: WindowState[]
}
interface TmuxStateShape {
  installed: boolean
  serverRunning: boolean
  attached: boolean
  attachedSession?: string
  sessions: SessionState[]
}

const state = ref<TmuxStateShape | null>(null)
const loading = ref(false)
const errored = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

async function refresh(): Promise<void> {
  loading.value = true
  try {
    // Terminal serves the API under /api and injects auth + base via settingsApiFetch.
    const path = `/api/tmux/state?session=${encodeURIComponent(props.sessionId)}`
    const resp = await settingsApiFetch(path)
    if (!resp.ok) { errored.value = true; return }
    state.value = (await resp.json()) as TmuxStateShape
    errored.value = false
  } catch {
    errored.value = true
  } finally {
    loading.value = false
  }
}

// The session this shell is attached to (falls back to the first attached session, then
// the first session) — the same scoping rule the terminal's pane bar uses.
const session = computed<SessionState | null>(() => {
  const s = state.value
  if (!s || !s.sessions?.length) return null
  const name = s.attachedSession
  return (
    (name && s.sessions.find((x) => x.name === name)) ||
    s.sessions.find((x) => x.attached) ||
    s.sessions[0]
  )
})

// Flatten the attached session's windows into a single pane list, tagging each pane
// with its window name so the row reads naturally even across windows.
interface PaneRow extends PaneState {
  windowName: string
  windowIndex: number
}
const panes = computed<PaneRow[]>(() => {
  const s = session.value
  if (!s) return []
  const rows: PaneRow[] = []
  for (const w of s.windows ?? []) {
    for (const p of w.panes ?? []) {
      rows.push({ ...p, windowName: w.name, windowIndex: w.index })
    }
  }
  return rows
})

const paneCount = computed(() => panes.value.length)
const activeAgentCount = computed(
  () => panes.value.filter((p) => p.agentStatus === 'running' || p.agentStatus === 'waiting').length,
)
// Session cwd ≈ the active pane's cwd (or the first pane's). The overview anchors on it.
const sessionCwd = computed(() => {
  const active = panes.value.find((p) => p.active)
  return active?.cwd || panes.value[0]?.cwd || ''
})

function basename(p: string | undefined): string {
  if (!p) return ''
  const parts = p.replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || p
}

function toolLabel(tool: AgentTool | undefined): string {
  if (!tool) return 'shell'
  return tool
}

function statusClass(status: AgentStatus | undefined): string {
  switch (status) {
    case 'running': return 'bg-green-500'
    case 'waiting': return 'bg-amber-500'
    case 'idle': return 'bg-muted-foreground/60'
    case 'done': return 'bg-muted-foreground/40'
    default: return 'bg-muted-foreground/30'
  }
}
function statusLabel(status: AgentStatus | undefined): string {
  switch (status) {
    case 'running': return '运行中'
    case 'waiting': return '等待输入'
    case 'idle': return '空闲'
    case 'done': return '已结束'
    default: return '—'
  }
}

watch(() => props.sessionId, () => { void refresh() })

onMounted(() => {
  void refresh()
  timer = setInterval(() => void refresh(), 2000)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="flex flex-col h-full bg-background text-foreground" data-testid="session-overview">
    <!-- Rollup header -->
    <div class="shrink-0 border-b border-border bg-card px-3 py-2.5">
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-semibold truncate">
          {{ session?.name || '会话总览' }}
        </span>
        <button
          class="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          type="button"
          title="刷新"
          data-testid="session-overview-refresh"
          @click="refresh"
        >
          <RefreshCw class="size-3.5" :class="{ 'animate-spin': loading }" />
        </button>
      </div>
      <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.66rem] text-muted-foreground tabular-nums">
        <span>{{ paneCount }} 个窗格</span>
        <span class="flex items-center gap-1">
          <span class="inline-block size-1.5 rounded-full bg-green-500" />
          {{ activeAgentCount }} 活跃
        </span>
      </div>
      <div v-if="sessionCwd" class="mt-1 flex items-center gap-1 text-[0.62rem] text-muted-foreground/80 truncate">
        <FolderOpen class="size-3 shrink-0" />
        <span class="truncate" :title="sessionCwd">{{ sessionCwd }}</span>
      </div>
    </div>

    <!-- Pane rows -->
    <div class="flex-1 overflow-y-auto px-2 py-2">
      <div v-if="errored && !state" class="px-2 py-6 text-center text-xs text-muted-foreground italic">
        无法获取会话状态
      </div>
      <div v-else-if="!panes.length && loading" class="px-2 py-6 text-center text-xs text-muted-foreground italic">
        加载中…
      </div>
      <div v-else-if="!panes.length" class="px-2 py-6 text-center text-xs text-muted-foreground italic">
        当前会话无 tmux 窗格
      </div>
      <ul v-else class="flex flex-col gap-1.5">
        <li
          v-for="p in panes"
          :key="p.windowIndex + ':' + p.index"
          class="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2"
          :class="{ 'border-primary/50': p.active }"
          :data-testid="`session-overview-pane-${p.windowIndex}-${p.index}`"
        >
          <!-- tool icon -->
          <span class="shrink-0 text-muted-foreground">
            <Bot v-if="p.agentTool" class="size-4" />
            <TerminalIcon v-else class="size-4" />
          </span>
          <!-- body -->
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-medium truncate text-foreground">{{ toolLabel(p.agentTool) }}</span>
              <span class="text-[0.6rem] text-muted-foreground/70 shrink-0">w{{ p.windowIndex }}·p{{ p.index }}</span>
            </div>
            <div class="mt-0.5 flex items-center gap-1.5 text-[0.62rem] text-muted-foreground truncate">
              <FolderOpen class="size-2.5 shrink-0" />
              <span class="truncate" :title="p.cwd">{{ basename(p.cwd) || p.windowName || '—' }}</span>
            </div>
          </div>
          <!-- status dot + label -->
          <span class="flex shrink-0 items-center gap-1.5">
            <span class="inline-block size-2 rounded-full" :class="statusClass(p.agentStatus)" />
            <span class="text-[0.6rem] text-muted-foreground">{{ statusLabel(p.agentStatus) }}</span>
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>
