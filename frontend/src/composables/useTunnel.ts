/**
 * useTunnel — single source of truth for the Cloudflare-tunnel lifecycle.
 *
 * "Is there a tunnel + what's its https URL" is needed in two places now:
 *   1. Settings → Internet Access (InternetAccessSection.vue) — expose this server publicly.
 *   2. The notification onboarding sheet (terminal's InstallGuideSheet) — the tunnel's HTTPS
 *      origin is the one-tap fix for "Web Push needs a secure context" when accessed over a
 *      LAN IP / bare hostname.
 *
 * Both call the SAME backend via the host-injected `settingsApiFetch`, so auth + base URL are
 * identical whether running in pro or in the standalone terminal (the terminal wires its cli-auth
 * fetch into setSettingsApiFetch at startup). This composable owns the start→poll→ready flow,
 * including the cloudflared download phase, so the two consumers never duplicate it.
 *
 * Each call returns an INDEPENDENT instance (its own reactive state + poll timers) — a section and
 * the sheet can each `start()`/observe without clobbering one another's timers. The backend tunnel
 * itself is a single shared resource; `refreshStatus()` reflects whatever is already running.
 */
import { reactive, ref, toRefs, type Ref } from 'vue'
import { settingsApiFetch } from '@ce/framework/portal'

export interface TunnelStatus {
  running: boolean
  publicURL?: string
  downloading?: boolean
  downloadedBytes?: number
  totalBytes?: number
  downloadURL?: string
  binPath?: string
}

export interface UseTunnel {
  /** cloudflared is live AND has produced a public URL is reflected here. */
  running: Ref<boolean>
  /** The https://… origin once the tunnel is up (''/empty until then). */
  publicURL: Ref<string>
  /** cloudflared binary is being downloaded (first run). */
  downloading: Ref<boolean>
  /** A start() is in flight (POST sent, polling for a URL). */
  starting: Ref<boolean>
  /** Bytes downloaded so far + total (total = -1 when unknown). */
  downloadedBytes: Ref<number>
  totalBytes: Ref<number>
  /** Manual-download fallback metadata surfaced during the download phase. */
  downloadURL: Ref<string>
  binPath: Ref<string>
  /** Last error message (''/empty when none). */
  error: Ref<string>
  /** EMA download speed in bytes/sec (0 when not downloading). */
  downloadSpeedBps: Ref<number>
  /** POST /api/tunnel/start, then poll /api/tunnel/status until a publicURL or timeout. */
  start(): Promise<void>
  /** One-shot read of the current tunnel state (e.g. on mount). */
  refreshStatus(): Promise<void>
  /** POST /api/tunnel/stop and reset local state. */
  stop(): Promise<void>
  /** Clear poll timers (call on unmount). */
  dispose(): void
}

/** Post-download "waiting for cloudflared to produce a URL" timeout (ms). */
const START_TIMEOUT_MS = 90_000
const POLL_INTERVAL_MS = 1_000

export function useTunnel(): UseTunnel {
  const state = reactive({
    running: false,
    starting: false,
    publicURL: '',
    downloading: false,
    downloadedBytes: 0,
    totalBytes: -1,
    downloadURL: '',
    binPath: '',
  })
  const error = ref('')
  const downloadSpeedBps = ref(0)

  let pollInterval: ReturnType<typeof setInterval> | null = null
  let startDeadline: ReturnType<typeof setTimeout> | null = null
  let lastPollBytes = 0
  let lastPollTime = 0

  function stopPolling(): void {
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null }
    if (startDeadline) { clearTimeout(startDeadline); startDeadline = null }
  }

  function applyStatus(status: TunnelStatus): void {
    state.running = status.running
    state.publicURL = status.publicURL ?? ''
    state.downloading = status.downloading ?? false
    state.downloadedBytes = status.downloadedBytes ?? 0
    state.totalBytes = status.totalBytes ?? -1
    state.downloadURL = status.downloadURL ?? ''
    state.binPath = status.binPath ?? ''
  }

  async function refreshStatus(): Promise<void> {
    try {
      const res = await settingsApiFetch('/api/tunnel/status')
      if (res.ok) applyStatus(await res.json())
    } catch { /* ignore — transient/unreachable */ }
  }

  async function start(): Promise<void> {
    state.starting = true
    error.value = ''
    try {
      const resp = await settingsApiFetch('/api/tunnel/start', { method: 'POST' })
      if (!resp.ok) { error.value = 'Failed to request tunnel start'; state.starting = false; return }
    } catch {
      error.value = 'Network error — server unreachable'; state.starting = false; return
    }

    lastPollBytes = 0
    lastPollTime = Date.now()
    downloadSpeedBps.value = 0

    // Poll every second. The timeout applies ONLY to the post-download cloudflared start phase —
    // the download itself can take minutes and never times out.
    pollInterval = setInterval(async () => {
      try {
        const status = await settingsApiFetch('/api/tunnel/status').then(r => r.json()) as TunnelStatus
        applyStatus(status)

        if (status.downloading) {
          const now = Date.now()
          const dt = (now - lastPollTime) / 1000
          if (dt > 0) {
            const instant = ((status.downloadedBytes ?? 0) - lastPollBytes) / dt
            downloadSpeedBps.value = downloadSpeedBps.value === 0 ? instant : 0.3 * instant + 0.7 * downloadSpeedBps.value
          }
          lastPollBytes = status.downloadedBytes ?? 0
          lastPollTime = now
          if (startDeadline) { clearTimeout(startDeadline); startDeadline = null }
          return
        }

        if (!status.running && !status.downloading) {
          if (!startDeadline) {
            startDeadline = setTimeout(() => {
              if (!state.running) {
                stopPolling()
                state.starting = false
                error.value = 'Timeout — cloudflared did not produce a URL in 90s. Check server logs.'
              }
            }, START_TIMEOUT_MS)
          }
          return
        }

        if (status.running) { stopPolling(); state.starting = false; downloadSpeedBps.value = 0 }
      } catch { /* transient poll errors */ }
    }, POLL_INTERVAL_MS)
  }

  async function stop(): Promise<void> {
    stopPolling()
    try { await settingsApiFetch('/api/tunnel/stop', { method: 'POST' }) } catch { /* ignore */ }
    state.running = false
    state.starting = false
    state.publicURL = ''
    state.downloading = false
    error.value = ''
    downloadSpeedBps.value = 0
  }

  function dispose(): void {
    stopPolling()
  }

  const refs = toRefs(state)
  return {
    running: refs.running,
    publicURL: refs.publicURL,
    downloading: refs.downloading,
    starting: refs.starting,
    downloadedBytes: refs.downloadedBytes,
    totalBytes: refs.totalBytes,
    downloadURL: refs.downloadURL,
    binPath: refs.binPath,
    error,
    downloadSpeedBps,
    start,
    refreshStatus,
    stop,
    dispose,
  }
}
