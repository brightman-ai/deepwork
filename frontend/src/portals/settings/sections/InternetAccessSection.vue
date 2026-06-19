<script setup lang="ts">
/**
 * Internet Access (Cloudflare Tunnel) — a SHARED settings section owned by @ce. It exposes
 * "this server" to the public internet, so it applies to the standalone terminal AND to pro as
 * a whole. Defined once here; contributed to the 'settings' slot for every host (see
 * portals/settings/index.ts). Backend access goes through the host-injected `settingsApiFetch`
 * so @ce never reverse-depends on terminal/pro.
 */
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { Globe, ClipboardCopy } from 'lucide-vue-next'
import { useTunnel } from '@ce/composables/useTunnel'

// Tunnel lifecycle (start → download → poll → ready) lives in the shared useTunnel SSOT; this
// section is now a thin view over it. The composable returns refs; wrapping them in reactive()
// deep-unwraps them so the existing template (`tunnel.running`, `tunnel.totalBytes`, …) and the
// computeds below keep reading plain values — zero template/behavior change.
const _tunnel = useTunnel()
const tunnel = reactive({
  running: _tunnel.running,
  starting: _tunnel.starting,
  publicURL: _tunnel.publicURL,
  downloading: _tunnel.downloading,
  downloadedBytes: _tunnel.downloadedBytes,
  totalBytes: _tunnel.totalBytes,
  downloadURL: _tunnel.downloadURL,
  binPath: _tunnel.binPath,
})
const tunnelError = _tunnel.error
const downloadSpeedBps = _tunnel.downloadSpeedBps
const startTunnel = _tunnel.start
const stopTunnel = _tunnel.stop

const copyTarget = ref('')
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    copyTarget.value = text
    setTimeout(() => { if (copyTarget.value === text) copyTarget.value = '' }, 2000)
  } catch { /* ignore */ }
}

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

    <!-- Off -->
    <div v-if="!tunnel.running && !tunnel.starting" class="ia-off">
      <button class="ia-btn-primary" data-testid="tunnel-enable" @click="startTunnel">
        <Globe :size="14" /> Enable Internet Access
      </button>
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

    <!-- Active -->
    <div v-if="tunnel.running" class="ia-active">
      <div class="ia-url-active">
        <Globe :size="14" class="ia-url-icon" />
        <a :href="tunnel.publicURL" target="_blank" class="ia-url-link" data-testid="tunnel-url">{{ tunnel.publicURL }}</a>
        <button class="ssec-copy-btn" title="复制链接" @click="copyText(tunnel.publicURL)"><ClipboardCopy :size="12" /></button>
      </div>
      <button class="ia-btn-ghost" data-testid="tunnel-disconnect" @click="stopTunnel">Disconnect</button>
    </div>
  </div>
</template>

<style scoped>
/* `.ssec-*` shared chrome is loaded globally by @ce's SettingsPortal wrapper (section-ui.css). */
.ia-off { margin-top: 4px; }
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
.ia-active { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
.ia-url-active { display: flex; align-items: center; gap: 6px; padding: 8px 10px; background: hsl(140 50% 40% / 0.08); border: 1px solid hsl(140 50% 40% / 0.25); border-radius: 6px; }
.ia-url-icon { color: hsl(140 50% 40%); flex-shrink: 0; }
.ia-url-link { font-size: 12px; font-weight: 500; color: hsl(140 50% 40%); text-decoration: none; word-break: break-all; }
.ia-url-link:hover { text-decoration: underline; }
.ia-btn-primary { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; font-size: 12px; font-weight: 500; border-radius: 6px; border: 1px solid hsl(var(--border)); background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); cursor: pointer; transition: opacity 0.1s; }
.ia-btn-primary:hover { opacity: 0.85; }
.ia-btn-ghost { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; font-size: 11px; font-weight: 500; border-radius: 5px; border: 1px solid hsl(var(--border)); background: transparent; color: hsl(var(--muted-foreground)); cursor: pointer; align-self: flex-start; }
.ia-btn-ghost:hover { background: hsl(var(--muted) / 0.6); color: hsl(var(--foreground)); }
</style>
