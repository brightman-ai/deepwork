<script setup lang="ts">
/**
 * Internet Access (Cloudflare Tunnel) — a SHARED settings section owned by @ce. It exposes
 * "this server" to the public internet, so it applies to the standalone terminal AND to pro as
 * a whole. Defined once here; contributed to the 'settings' slot for every host (see
 * portals/settings/index.ts). Backend access goes through the host-injected `settingsApiFetch`
 * so @ce never reverse-depends on terminal/pro.
 *
 * Two modes (Off state is a chooser): 试用 quick (`*.trycloudflare.com`, dies on restart) and
 * 固定域名 named (a user-configured domain via `cloudflared tunnel login` → run --protocol http2,
 * persists across restarts). Both drive the SAME useTunnel SSOT; this section stays a thin view.
 */
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { Globe, ClipboardCopy } from 'lucide-vue-next'
import QRCode from 'qrcode'
import { useTunnel, type UseTunnel } from '@ce/composables/useTunnel'
import { copyTextToClipboard } from '@ce/utils/clipboard'

// A host that composes this section (e.g. AccessSection's 公网 tab) can inject ITS useTunnel
// instance so the two share one reactive tunnel state — enable here, the composer's QR updates. When
// mounted standalone (no prop), we own a fresh instance, exactly as before.
const props = defineProps<{ tunnel?: UseTunnel }>()

// Tunnel lifecycle (start → download → poll → ready) lives in the shared useTunnel SSOT; this
// section is now a thin view over it. The composable returns refs; wrapping them in reactive()
// deep-unwraps them so the existing template (`tunnel.running`, `tunnel.totalBytes`, …) and the
// computeds below keep reading plain values — zero template/behavior change.
const _tunnel = props.tunnel ?? useTunnel()
const tunnel = reactive({
  running: _tunnel.running,
  starting: _tunnel.starting,
  publicURL: _tunnel.publicURL,
  downloading: _tunnel.downloading,
  downloadedBytes: _tunnel.downloadedBytes,
  totalBytes: _tunnel.totalBytes,
  downloadURL: _tunnel.downloadURL,
  binPath: _tunnel.binPath,
  mode: _tunnel.mode,
  hostname: _tunnel.hostname,
  account: _tunnel.account,
  loginState: _tunnel.loginState,
  loginURL: _tunnel.loginURL,
  ready: _tunnel.ready,
})
const tunnelError = _tunnel.error
const downloadSpeedBps = _tunnel.downloadSpeedBps
const startTunnel = _tunnel.start
const stopTunnel = _tunnel.stop

// Off-state mode chooser + named-tunnel domain draft. `chosen` defaults to 试用 so the familiar
// Enable button is one glance away; 固定域名 is one click over.
const chosen = ref<'quick' | 'named'>('quick')
const hostnameInput = ref('')

function connectAccount() { void _tunnel.login() }
function enableNamed() {
  const h = hostnameInput.value.trim()
  if (h) void _tunnel.startNamed(h)
}

const copyTarget = ref('')
async function copyText(text: string) {
  // SSOT helper: iOS/HTTP-safe (navigator.clipboard is undefined on insecure origins).
  if (await copyTextToClipboard(text)) {
    copyTarget.value = text
    setTimeout(() => { if (copyTarget.value === text) copyTarget.value = '' }, 2000)
  }
}

// One QR, rendered from whichever URL is currently relevant: the public https://<hostname> when a
// named tunnel is up (扫码访问), or the Cloudflare authorize URL during login. Reuses the same
// `qrcode` → data-URI → <img> pattern as AccessSection (no external CDN).
const qrSource = computed(() => {
  if (tunnel.running && tunnel.mode === 'named' && tunnel.publicURL) return tunnel.publicURL
  if (tunnel.loginURL) return tunnel.loginURL
  return ''
})
const qrDataUrl = ref('')
watch(qrSource, async (src) => {
  if (!src) { qrDataUrl.value = ''; return }
  try { qrDataUrl.value = await QRCode.toDataURL(src, { margin: 1, width: 200 }) } catch { qrDataUrl.value = '' }
}, { immediate: true })
// Prefill the domain input from the persisted/last-known hostname (§1.5 回填).
watch(() => tunnel.hostname, (h) => { if (h && !hostnameInput.value) hostnameInput.value = h })

// Reflect any already-running tunnel on entry; release poll timers on unmount.
onMounted(() => { void _tunnel.refreshStatus() })
onUnmounted(() => _tunnel.dispose())

function formatBytes(bytes: number): string {
  if (bytes >= 1 << 20) return `${(bytes / (1 << 20)).toFixed(1)} MB`
  if (bytes >= 1 << 10) return `${(bytes / (1 << 10)).toFixed(0)} KB`
  return `${bytes} B`
}
function formatSpeed(bps: number): string {
  if (bps <= 0) return '—'
  if (bps >= 1 << 20) return `${(bps / (1 << 20)).toFixed(1)} MB/s`
  if (bps >= 1 << 10) return `${(bps / (1 << 10)).toFixed(0)} KB/s`
  return `${bps.toFixed(0)} B/s`
}
function formatEta(remainingBytes: number, bps: number): string {
  if (bps <= 0 || remainingBytes <= 0) return '—'
  const s = Math.round(remainingBytes / bps)
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${s}s`
}
const downloadPct = computed(() => {
  if (tunnel.totalBytes <= 0 || tunnel.downloadedBytes <= 0) return 0
  return Math.min(100, Math.round((tunnel.downloadedBytes / tunnel.totalBytes) * 100))
})
const downloadEta = computed(() => formatEta(tunnel.totalBytes - tunnel.downloadedBytes, downloadSpeedBps.value))
</script>

<template>
  <div class="ssec-body" data-testid="settings-section-internet">
    <div class="ssec-header">Internet Access</div>
    <p class="ssec-hint">通过 Cloudflare Tunnel 将此服务暴露到公网。</p>

    <!-- Off: mode chooser (试用 quick / 固定域名 named) -->
    <div v-if="!tunnel.running && !tunnel.starting" class="ia-off">
      <div class="ia-modes" role="tablist">
        <button
          class="ia-mode" :class="{ active: chosen === 'quick' }"
          role="tab" data-testid="mode-quick" @click="chosen = 'quick'"
        >试用</button>
        <button
          class="ia-mode" :class="{ active: chosen === 'named' }"
          role="tab" data-testid="mode-named" @click="chosen = 'named'"
        >固定域名</button>
      </div>

      <!-- 试用 (quick): existing one-tap enable + prominent restart warning. -->
      <div v-if="chosen === 'quick'" class="ia-mode-pane">
        <p class="ia-warn">⚠ 临时域名，服务重启后失效</p>
        <button class="ia-btn-primary" data-testid="tunnel-enable" @click="startTunnel">
          <Globe :size="14" /> Enable Internet Access
        </button>
      </div>

      <!-- 固定域名 (named): step A connect account → step B domain input. -->
      <div v-else class="ia-mode-pane">
        <!-- Step A: connect a Cloudflare account (cert.pem absent). -->
        <template v-if="!tunnel.account">
          <button
            v-if="tunnel.loginState !== 'pending'"
            class="ia-btn-primary" data-testid="tunnel-login" @click="connectAccount"
          >
            <Globe :size="14" /> 连接 Cloudflare 账号
          </button>
          <div v-else class="ia-login">
            <p class="ia-status-text">在浏览器打开并授权你的域名，授权后自动继续…</p>
            <div v-if="tunnel.loginURL" class="ia-url-row">
              <a
                :href="tunnel.loginURL" target="_blank" rel="noopener"
                class="ia-login-link" data-testid="tunnel-login-url"
              >{{ tunnel.loginURL }}</a>
              <button class="ssec-copy-btn" title="复制链接" @click="copyText(tunnel.loginURL)"><ClipboardCopy :size="12" /></button>
            </div>
            <img
              v-if="qrDataUrl" class="ia-qr" :src="qrDataUrl" alt="授权二维码"
              width="180" height="180" data-testid="tunnel-login-qr"
            />
            <div class="ia-bar"><div class="ia-bar-fill--indeterminate" /></div>
          </div>
        </template>

        <!-- Step B: domain input (account present). Placeholder only — no hardcoded default. -->
        <template v-else>
          <div class="ia-hostname-row">
            <input
              v-model="hostnameInput" class="ia-hostname-input" placeholder="sub.example.com"
              autocapitalize="off" autocomplete="off" spellcheck="false"
              data-testid="tunnel-hostname-input" @keyup.enter="enableNamed"
            />
            <button class="ia-btn-primary" data-testid="tunnel-named-enable" @click="enableNamed">启用</button>
          </div>
          <p class="ia-hint-sm">固定域名持久有效，服务重启后仍可访问。</p>
        </template>
      </div>

      <p v-if="tunnelError" class="ia-error">{{ tunnelError }}</p>
    </div>

    <!-- Downloading cloudflared -->
    <div v-if="tunnel.starting && tunnel.downloading" class="ia-starting">
      <div class="ia-dl-header">
        <span class="ia-dl-label">Downloading cloudflared...</span>
        <span class="ia-dl-pct">{{ downloadPct }}%</span>
      </div>
      <div class="ia-bar"><div class="ia-bar-fill--determinate" :style="{ width: downloadPct + '%' }" /></div>
      <div class="ia-dl-stats">
        <span>{{ formatBytes(tunnel.downloadedBytes) }}{{ tunnel.totalBytes > 0 ? ` / ${formatBytes(tunnel.totalBytes)}` : '' }}</span>
        <span>↓ {{ formatSpeed(downloadSpeedBps) }}</span>
        <span v-if="tunnel.totalBytes > 0">ETA {{ downloadEta }}</span>
      </div>
      <div class="ia-manual">
        <span class="ia-manual-label">慢？手动下载后重新点击 Enable：</span>
        <div class="ia-url-row">
          <code class="ia-url-text">{{ tunnel.downloadURL }}</code>
          <button class="ssec-copy-btn" title="复制链接" @click="copyText(tunnel.downloadURL)"><ClipboardCopy :size="12" /></button>
        </div>
        <div class="ia-url-row">
          <span class="ia-manual-label">放置路径：</span>
          <code class="ia-url-text">{{ tunnel.binPath }}</code>
          <button class="ssec-copy-btn" title="复制路径" @click="copyText(tunnel.binPath)"><ClipboardCopy :size="12" /></button>
        </div>
      </div>
    </div>

    <!-- Waiting for URL -->
    <div v-if="tunnel.starting && !tunnel.downloading" class="ia-starting">
      <div class="ia-bar"><div class="ia-bar-fill--indeterminate" /></div>
      <p class="ia-status-text">Starting Cloudflare Tunnel...</p>
    </div>

    <!-- Active (named): persistent domain + scan-to-visit QR, NO restart warning. -->
    <div v-if="tunnel.running && tunnel.mode === 'named'" class="ia-active">
      <div class="ia-url-active">
        <Globe :size="14" class="ia-url-icon" />
        <a :href="tunnel.publicURL" target="_blank" class="ia-url-link" data-testid="tunnel-url">{{ tunnel.publicURL }}</a>
        <button class="ssec-copy-btn" title="复制链接" @click="copyText(tunnel.publicURL)"><ClipboardCopy :size="12" /></button>
      </div>
      <div v-if="qrDataUrl" class="ia-qr-block">
        <img class="ia-qr" :src="qrDataUrl" alt="访问二维码" width="180" height="180" data-testid="tunnel-qr" />
        <span class="ia-hint-sm">扫码访问</span>
      </div>
      <button class="ia-btn-ghost" data-testid="tunnel-disconnect" @click="stopTunnel">Disconnect</button>
    </div>

    <!-- Active (quick): existing green box + Disconnect + transient-domain note. -->
    <div v-else-if="tunnel.running" class="ia-active">
      <div class="ia-url-active">
        <Globe :size="14" class="ia-url-icon" />
        <a :href="tunnel.publicURL" target="_blank" class="ia-url-link" data-testid="tunnel-url">{{ tunnel.publicURL }}</a>
        <button class="ssec-copy-btn" title="复制链接" @click="copyText(tunnel.publicURL)"><ClipboardCopy :size="12" /></button>
      </div>
      <p class="ia-warn-sm">⚠ 临时域名，服务重启后失效</p>
      <button class="ia-btn-ghost" data-testid="tunnel-disconnect" @click="stopTunnel">Disconnect</button>
    </div>
  </div>
</template>

<style scoped>
/* `.ssec-*` shared chrome is loaded globally by @ce's SettingsPortal wrapper (section-ui.css). */
.ia-off { margin-top: 4px; }
.ia-modes { display: flex; gap: 6px; margin-bottom: 10px; }
.ia-mode { display: inline-flex; align-items: center; padding: 5px 14px; font-size: 12px; border-radius: 7px; cursor: pointer; border: 1px solid hsl(var(--border)); background: hsl(var(--muted)); color: hsl(var(--muted-foreground)); }
.ia-mode.active { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); border-color: hsl(var(--primary)); }
.ia-mode-pane { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.ia-warn { font-size: 11px; font-weight: 600; color: hsl(38 92% 42%); background: hsl(38 92% 50% / 0.1); border: 1px solid hsl(38 92% 50% / 0.3); border-radius: 6px; padding: 5px 9px; margin: 0; }
.ia-warn-sm { font-size: 11px; color: hsl(38 92% 42%); margin: 0; }
.ia-hint-sm { font-size: 11px; color: hsl(var(--muted-foreground)); margin: 0; }
.ia-login { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.ia-login-link { font-size: 12px; font-weight: 500; color: hsl(var(--primary)); text-decoration: none; word-break: break-all; flex: 1; }
.ia-login-link:hover { text-decoration: underline; }
.ia-hostname-row { display: flex; gap: 8px; width: 100%; align-items: center; }
.ia-hostname-input { flex: 1; max-width: 280px; font-family: monospace; font-size: 12px; color: hsl(var(--foreground)); background: hsl(var(--muted)); padding: 7px 10px; border-radius: 6px; border: 1px solid hsl(var(--border)); }
.ia-hostname-input:focus { outline: none; border-color: hsl(var(--primary)); }
.ia-qr-block { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.ia-qr { background: #fff; padding: 8px; border-radius: 8px; border: 1px solid hsl(var(--border)); display: block; }
.ia-starting { margin-top: 6px; }
.ia-dl-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 5px; }
.ia-dl-label { font-size: 12px; font-weight: 500; color: hsl(var(--foreground)); }
.ia-dl-pct { font-size: 12px; font-weight: 600; color: hsl(var(--primary)); font-variant-numeric: tabular-nums; }
.ia-bar { height: 4px; background: hsl(var(--muted)); border-radius: 2px; overflow: hidden; margin-bottom: 6px; }
.ia-bar-fill--determinate { height: 100%; background: hsl(var(--primary)); border-radius: 2px; transition: width 0.8s linear; }
.ia-bar-fill--indeterminate { height: 100%; width: 35%; background: hsl(var(--primary)); border-radius: 2px; animation: ia-slide 1.4s ease-in-out infinite; }
@keyframes ia-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(340%); } }
.ia-dl-stats { display: flex; gap: 14px; font-size: 11px; color: hsl(var(--muted-foreground)); font-variant-numeric: tabular-nums; margin-bottom: 10px; }
.ia-manual { border-top: 1px solid hsl(var(--border)); padding-top: 8px; display: flex; flex-direction: column; gap: 4px; }
.ia-manual-label { font-size: 10px; color: hsl(var(--muted-foreground)); }
.ia-url-row { display: flex; align-items: center; gap: 4px; }
.ia-url-text { font-family: monospace; font-size: 10px; color: hsl(var(--foreground)); background: hsl(var(--muted)); padding: 2px 5px; border-radius: 3px; word-break: break-all; flex: 1; }
.ia-status-text { font-size: 11px; color: hsl(var(--muted-foreground)); margin: 0; }
.ia-error { font-size: 11px; color: hsl(0 65% 50%); margin: 6px 0 0; }
.ia-active { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; align-items: flex-start; }
.ia-url-active { display: flex; align-items: center; gap: 6px; padding: 8px 10px; background: hsl(140 50% 40% / 0.08); border: 1px solid hsl(140 50% 40% / 0.25); border-radius: 6px; }
.ia-url-icon { color: hsl(140 50% 40%); flex-shrink: 0; }
.ia-url-link { font-size: 12px; font-weight: 500; color: hsl(140 50% 40%); text-decoration: none; word-break: break-all; }
.ia-url-link:hover { text-decoration: underline; }
.ia-btn-primary { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; font-size: 12px; font-weight: 500; border-radius: 6px; border: 1px solid hsl(var(--border)); background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); cursor: pointer; transition: opacity 0.1s; }
.ia-btn-primary:hover { opacity: 0.85; }
.ia-btn-ghost { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; font-size: 11px; font-weight: 500; border-radius: 5px; border: 1px solid hsl(var(--border)); background: transparent; color: hsl(var(--muted-foreground)); cursor: pointer; align-self: flex-start; }
.ia-btn-ghost:hover { background: hsl(var(--muted) / 0.6); color: hsl(var(--foreground)); }
</style>
