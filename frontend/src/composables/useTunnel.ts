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
  /** "quick" | "named" | "" (off) — which tunnel mode the backend is running. */
  mode?: string
  /** named target domain (empty for quick). */
  hostname?: string
  /** cert.pem present → this dataDir is logged into a Cloudflare account. */
  account?: boolean
  /** "" | "pending" | "done" | "error" — cloudflared tunnel login flow state. */
  loginState?: string
  /** The Cloudflare authorize URL to surface (link + QR) during login. */
  loginURL?: string
  /** named: number of registered edge connections (0 = not through yet). */
  ready?: number
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
  /** Which mode is live: 'quick' | 'named' | '' (off). */
  mode: Ref<string>
  /** named target domain (''/empty for quick or off). */
  hostname: Ref<string>
  /** cert.pem present → logged into a Cloudflare account for this dataDir. */
  account: Ref<boolean>
  /** cloudflared tunnel login flow state: '' | 'pending' | 'done' | 'error'. */
  loginState: Ref<string>
  /** The Cloudflare authorize URL to show (link + QR) during login. */
  loginURL: Ref<string>
  /** named: registered edge connections (0 = not through yet). */
  ready: Ref<number>
  /** Last error message (''/empty when none). */
  error: Ref<string>
  /** EMA download speed in bytes/sec (0 when not downloading). */
  downloadSpeedBps: Ref<number>
  /** POST /api/tunnel/start, then poll /api/tunnel/status until a publicURL or timeout. */
  start(): Promise<void>
  /** POST /api/tunnel/login, then poll /api/tunnel/status until loginState==='done' (or error). */
  login(): Promise<void>
  /** POST /api/tunnel/named {hostname}, then poll /api/tunnel/status until running (or timeout). */
  startNamed(hostname: string): Promise<void>
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
/** cloudflared tunnel login can wait on a human authorizing in the browser — allow generous time. */
const LOGIN_TIMEOUT_MS = 300_000

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
    mode: '',
    hostname: '',
    account: false,
    loginState: '',
    loginURL: '',
    ready: 0,
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
    state.mode = status.mode ?? ''
    state.hostname = status.hostname ?? ''
    state.account = status.account ?? false
    state.loginState = status.loginState ?? ''
    state.loginURL = status.loginURL ?? ''
    state.ready = status.ready ?? 0
  }

  async function refreshStatus(): Promise<void> {
    try {
      const res = await settingsApiFetch('/api/tunnel/status')
      if (res.ok) applyStatus(await res.json())
    } catch { /* ignore — transient/unreachable */ }
  }

  // The download→running poll, shared by start() (quick) and startNamed(). Polls /status every second;
  // the 90s deadline applies ONLY to the post-download cloudflared start phase — the download itself can
  // take minutes and never times out.
  function beginRunPoll(): void {
    lastPollBytes = 0
    lastPollTime = Date.now()
    downloadSpeedBps.value = 0

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

  async function start(): Promise<void> {
    state.starting = true
    error.value = ''
    try {
      const resp = await settingsApiFetch('/api/tunnel/start', { method: 'POST' })
      if (!resp.ok) { error.value = 'Failed to request tunnel start'; state.starting = false; return }
    } catch {
      error.value = 'Network error — server unreachable'; state.starting = false; return
    }
    beginRunPoll()
  }

  // Named-tunnel login: kick off `cloudflared tunnel login` on the backend, then poll /status so the UI
  // can surface the authorize URL (link + QR) and detect cert.pem landing (loginState==='done', which
  // flips `account` true → the section advances to the domain-input step).
  async function login(): Promise<void> {
    error.value = ''
    state.loginState = 'pending'
    state.loginURL = ''
    stopPolling()
    try {
      const resp = await settingsApiFetch('/api/tunnel/login', { method: 'POST' })
      if (!resp.ok) { error.value = 'Failed to start Cloudflare login'; state.loginState = 'error'; return }
    } catch {
      error.value = 'Network error — server unreachable'; state.loginState = 'error'; return
    }

    startDeadline = setTimeout(() => {
      if (state.loginState !== 'done') {
        stopPolling()
        state.loginState = 'error'
        error.value = 'Timeout — authorization not completed. Open the link above and authorize.'
      }
    }, LOGIN_TIMEOUT_MS)

    pollInterval = setInterval(async () => {
      try {
        const status = await settingsApiFetch('/api/tunnel/status').then(r => r.json()) as TunnelStatus
        applyStatus(status)
        if (status.loginState === 'done') { stopPolling() }
        else if (status.loginState === 'error') {
          stopPolling()
          error.value = error.value || 'Cloudflare login failed. Try again.'
        }
      } catch { /* transient poll errors */ }
    }, POLL_INTERVAL_MS)
  }

  // Named-tunnel start: create(if needed)+route DNS+run(http2) on the backend, then reuse the shared
  // download→running poll. `hostname` is user-supplied (no hardcoded default).
  async function startNamed(hostname: string): Promise<void> {
    state.starting = true
    error.value = ''
    try {
      const resp = await settingsApiFetch('/api/tunnel/named', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostname }),
      })
      if (!resp.ok) {
        // Fast-fail errors (§6: not logged in, DNS zone not on account) are passed through verbatim.
        let msg = 'Failed to start named tunnel'
        try { msg = (await resp.json()).error || msg } catch { /* keep default */ }
        error.value = msg; state.starting = false; return
      }
    } catch {
      error.value = 'Network error — server unreachable'; state.starting = false; return
    }
    beginRunPoll()
  }

  async function stop(): Promise<void> {
    stopPolling()
    try { await settingsApiFetch('/api/tunnel/stop', { method: 'POST' }) } catch { /* ignore */ }
    state.running = false
    state.starting = false
    state.publicURL = ''
    state.downloading = false
    state.mode = ''
    state.hostname = ''
    state.loginState = ''
    state.loginURL = ''
    state.ready = 0
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
    mode: refs.mode,
    hostname: refs.hostname,
    account: refs.account,
    loginState: refs.loginState,
    loginURL: refs.loginURL,
    ready: refs.ready,
    error,
    downloadSpeedBps,
    start,
    login,
    startNamed,
    refreshStatus,
    stop,
    dispose,
  }
}
