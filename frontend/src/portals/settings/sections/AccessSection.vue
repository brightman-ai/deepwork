<script setup lang="ts">
/**
 * Access — the SHARED "reach this server remotely" settings section (SSOT, @ce-owned). ONE coherent
 * flow: the access code, then a share target picker (公网 / Tailscale / LAN); the selected target
 * gives a link + QR with the code baked in (?auth=), so a phone scans straight in.
 *
 * The 公网 (Cloudflare tunnel) target is first-class: when the tunnel is off, its tab shows the
 * composed Internet Access enable/progress UI (reusing InternetAccessSection, given OUR shared
 * useTunnel instance); when it comes up, the same tab shows the public link + QR + a disconnect. So
 * there is no separate "Internet Access" section and no state to go stale — enabling the tunnel makes
 * its QR appear in-place, and we auto-switch to it (the most universally reachable address).
 *
 * Host-agnostic: every call goes through the injected settingsApiFetch against the standard contract
 * (GET /api/auth/code, POST /api/auth/rotate, GET /api/tunnel/status, GET /api/net/addresses).
 */
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import { ClipboardCopy, RefreshCw, Check, X, Pencil, Globe } from 'lucide-vue-next'
import QRCode from 'qrcode'
import InternetAccessSection from '@ce/portals/settings/sections/InternetAccessSection.vue'
import { settingsApiFetch } from '@ce/framework/portal'
import { useTunnel } from '@ce/composables/useTunnel'
import { copyTextToClipboard } from '@ce/utils/clipboard'

type Target = { kind: 'tunnel' | 'tailscale' | 'lan'; label: string; url: string }

const code = ref('')
const localAddrs = ref<Target[]>([])
const selected = ref(0)
const qrDataUrl = ref('')
const copiedCode = ref(false)
const copiedLink = ref(false)
const busy = ref(false)
const confirmingRotate = ref(false)
const editing = ref(false)
const editValue = ref('')
const editError = ref('')
let confirmTimer: ReturnType<typeof setTimeout> | undefined

// One shared tunnel instance, handed to the composed InternetAccessSection so enabling there updates
// OUR publicURL reactively (no stale copy, no polling).
const tunnel = useTunnel()

// Target list: 公网 is always present (its tab can enable the tunnel); tailscale/LAN appear when the
// server reports reachable interfaces.
const targets = computed<Target[]>(() => {
  const out: Target[] = [{ kind: 'tunnel', label: '公网', url: tunnel.publicURL.value }]
  return out.concat(localAddrs.value)
})
const current = computed(() => targets.value[selected.value] ?? targets.value[0])
// The share URL for the selected target — empty for 公网 while the tunnel isn't up yet (its tab shows
// the enable UI instead).
const shareLink = computed(() => {
  const t = current.value
  if (!t || !t.url || !code.value) return ''
  return t.url.replace(/\/+$/, '') + '/?auth=' + encodeURIComponent(code.value)
})

async function loadCode() {
  try {
    const r = await settingsApiFetch('/api/auth/code')
    if (r.ok) code.value = (await r.json()).code || ''
  } catch { /* ignore */ }
}
async function loadAddrs() {
  try {
    const r = await settingsApiFetch('/api/net/addresses')
    if (r.ok) {
      const d = await r.json()
      localAddrs.value = (d.addresses || []).map((a: { kind: 'tailscale' | 'lan'; url: string }) => ({
        kind: a.kind,
        label: a.kind === 'tailscale' ? 'Tailscale' : 'LAN',
        url: a.url,
      }))
    }
  } catch { /* ignore */ }
}

async function renderQR() {
  if (!shareLink.value) { qrDataUrl.value = ''; return }
  try {
    qrDataUrl.value = await QRCode.toDataURL(shareLink.value, { margin: 1, width: 200 })
  } catch { qrDataUrl.value = '' }
}
watch(shareLink, renderQR)
watch(targets, (t) => { if (selected.value >= t.length) selected.value = 0 })
// When the tunnel comes up, auto-switch the picker to 公网 (index 0) — the most universally reachable
// address, and the one the user just enabled.
watch(() => tunnel.publicURL.value, (url, prev) => { if (url && !prev) selected.value = 0 })

onMounted(async () => {
  await Promise.all([loadCode(), loadAddrs(), tunnel.refreshStatus()])
  // Default to a usable QR: the public tunnel if it's already up, otherwise the first local address.
  selected.value = tunnel.publicURL.value ? 0 : localAddrs.value.length ? 1 : 0
})
onUnmounted(() => tunnel.dispose())

async function copyCode() {
  if (await copyTextToClipboard(code.value)) {
    copiedCode.value = true
    setTimeout(() => { copiedCode.value = false }, 2000)
  }
}
async function copyLink() {
  if (shareLink.value && await copyTextToClipboard(shareLink.value)) {
    copiedLink.value = true
    setTimeout(() => { copiedLink.value = false }, 2000)
  }
}

// ONE helper for rotate (random) + manual save (custom): POST /api/auth/rotate with an optional
// {code}. No body → random; {code} → set custom. Either way old links/QR are invalidated at once.
async function setCode(custom?: string): Promise<boolean> {
  if (busy.value) return false
  busy.value = true
  editError.value = ''
  try {
    const init: RequestInit = { method: 'POST' }
    if (custom !== undefined) {
      init.headers = { 'Content-Type': 'application/json' }
      init.body = JSON.stringify({ code: custom })
    }
    const r = await settingsApiFetch('/api/auth/rotate', init)
    if (r.ok) {
      const d = await r.json()
      if (d.code) code.value = d.code
      editing.value = false
      return true
    }
    try { editError.value = (await r.json()).error || '保存失败' } catch { editError.value = '保存失败' }
    return false
  } catch { editError.value = '网络错误'; return false } finally {
    busy.value = false
  }
}

// Inline two-step confirm (NOT window.confirm — it blocks the JS thread + wedges headless automation
// and reads as a jarring system popup on mobile).
function askRotate() {
  confirmingRotate.value = true
  clearTimeout(confirmTimer)
  confirmTimer = setTimeout(() => { confirmingRotate.value = false }, 5000)
}
function cancelRotate() { confirmingRotate.value = false; clearTimeout(confirmTimer) }
async function doRotate() { cancelRotate(); await setCode() }

function startEdit() { editValue.value = code.value; editError.value = ''; editing.value = true }
function cancelEdit() { editing.value = false; editError.value = '' }
async function saveEdit() {
  const v = editValue.value.trim()
  if (!v) { editError.value = '请输入访问码'; return }
  await setCode(v)
}

function selectTarget(i: number) { selected.value = i }
async function disconnectTunnel() { await tunnel.stop() }
</script>

<template>
  <div class="ssec-body" data-testid="settings-section-access">
    <div class="ssec-header">访问码</div>
    <p class="ssec-hint">远程访问（非本机）需要此访问码。不区分大小写，<code>-</code> 可不输。</p>

    <!-- View mode: code + copy + edit + rotate -->
    <div v-if="!editing" class="auth-row">
      <code class="auth-code" data-testid="auth-current-code">{{ code || '—' }}</code>
      <button class="ssec-icon-btn" :class="{ 'is-done': copiedCode }" :title="copiedCode ? '已复制' : '复制'" @click="copyCode">
        <ClipboardCopy :size="14" />
      </button>
      <template v-if="!confirmingRotate">
        <button class="ssec-icon-btn" title="手动修改访问码" @click="startEdit"><Pencil :size="14" /></button>
        <button class="ssec-icon-btn" :disabled="busy" title="轮换为随机码（旧链接失效）" data-testid="auth-rotate" @click="askRotate">
          <RefreshCw :size="14" :class="{ spin: busy }" />
        </button>
      </template>
      <template v-else>
        <span class="warn-txt">旧链接将失效</span>
        <button class="ssec-icon-btn danger" title="确认轮换" @click="doRotate"><Check :size="14" /></button>
        <button class="ssec-icon-btn" title="取消" @click="cancelRotate"><X :size="14" /></button>
      </template>
    </div>

    <!-- Edit mode -->
    <div v-else class="auth-row">
      <input
        v-model="editValue" class="auth-input" placeholder="自定义访问码"
        autocapitalize="off" autocomplete="off" spellcheck="false"
        @keyup.enter="saveEdit" @keyup.esc="cancelEdit"
      />
      <button class="ssec-icon-btn primary" :disabled="busy" title="保存" @click="saveEdit"><Check :size="14" /></button>
      <button class="ssec-icon-btn" title="取消" @click="cancelEdit"><X :size="14" /></button>
    </div>
    <p v-if="editError" class="auth-err">{{ editError }}</p>

    <!-- Share: pick a target, then link + QR (with the code baked in). -->
    <div class="share-block">
      <p class="ssec-hint">扫码或点链接即可访问（已带访问码）。微信/企业微信里请点右上「···」→ 在浏览器打开。</p>
      <div class="share-tabs" role="tablist">
        <button
          v-for="(t, i) in targets" :key="t.kind + i"
          class="share-tab" :class="{ active: selected === i }"
          role="tab" :data-testid="'share-tab-' + t.kind"
          @click="selectTarget(i)"
        >
          <Globe v-if="t.kind === 'tunnel'" :size="12" /> {{ t.label }}
        </button>
      </div>

      <!-- 公网 tab, tunnel not up yet → enable/progress UI (composed, shares OUR tunnel instance). -->
      <div v-if="current?.kind === 'tunnel' && !tunnel.publicURL.value" class="share-pane">
        <InternetAccessSection :tunnel="tunnel" />
      </div>

      <!-- Any target with a URL (tunnel up, or tailscale/LAN) → share link + QR. -->
      <div v-else-if="shareLink" class="share-pane">
        <div class="share-row">
          <a class="share-link" :href="shareLink" target="_blank" rel="noopener" data-testid="share-link">{{ shareLink }}</a>
          <button class="ssec-icon-btn" :class="{ 'is-done': copiedLink }" :title="copiedLink ? '已复制' : '复制链接'" @click="copyLink">
            <ClipboardCopy :size="14" />
          </button>
        </div>
        <img v-if="qrDataUrl" class="share-qr" :src="qrDataUrl" alt="分享二维码" width="180" height="180" data-testid="share-qr" />
        <button v-if="current?.kind === 'tunnel'" class="ia-btn-ghost" data-testid="tunnel-disconnect" @click="disconnectTunnel">关闭公网访问</button>
      </div>

      <p v-else class="ssec-hint">此目标暂无可分享地址。</p>
    </div>
  </div>
</template>

<style scoped>
.auth-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.auth-code {
  font-family: monospace; font-size: 18px; font-weight: 700; letter-spacing: 0.15em;
  color: hsl(var(--foreground)); background: hsl(var(--muted));
  padding: 6px 12px; border-radius: 6px; border: 1px solid hsl(var(--border));
}
.auth-input {
  flex: 1; max-width: 240px; font-family: monospace; font-size: 16px; letter-spacing: 0.1em;
  color: hsl(var(--foreground)); background: hsl(var(--muted));
  padding: 7px 12px; border-radius: 6px; border: 1px solid hsl(var(--primary));
}
.auth-input:focus { outline: none; }
.auth-err { color: hsl(var(--destructive, 0 72% 51%)); font-size: 12px; margin: 2px 0 6px; }
.ssec-icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 6px;
  border: 1px solid hsl(var(--border)); background: hsl(var(--muted));
  color: hsl(var(--foreground)); cursor: pointer;
}
.ssec-icon-btn:hover { background: hsl(var(--accent)); }
.ssec-icon-btn:disabled { opacity: 0.5; cursor: default; }
.ssec-icon-btn.is-done { color: hsl(var(--primary)); }
.ssec-icon-btn.primary { background: hsl(var(--primary)); color: hsl(var(--primary-foreground, 0 0% 100%)); border-color: hsl(var(--primary)); }
.ssec-icon-btn.danger { color: hsl(var(--destructive, 0 72% 51%)); border-color: hsl(var(--destructive, 0 72% 51%)); }
.warn-txt { font-size: 12px; color: hsl(var(--destructive, 0 72% 51%)); white-space: nowrap; }
.spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.share-block { margin-top: 14px; }
.share-tabs { display: flex; gap: 6px; margin-bottom: 12px; }
.share-tab {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 5px 14px; font-size: 12px; border-radius: 7px; cursor: pointer;
  border: 1px solid hsl(var(--border)); background: hsl(var(--muted)); color: hsl(var(--muted-foreground));
}
.share-tab.active { background: hsl(var(--primary)); color: hsl(var(--primary-foreground, 0 0% 100%)); border-color: hsl(var(--primary)); }
.share-pane { margin-top: 4px; }
.share-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.share-link {
  font-family: monospace; font-size: 12px; word-break: break-all;
  color: hsl(var(--primary)); text-decoration: none;
  background: hsl(var(--muted)); padding: 6px 10px; border-radius: 6px; flex: 1;
}
.share-qr { background: #fff; padding: 8px; border-radius: 8px; border: 1px solid hsl(var(--border)); display: block; }
.ia-btn-ghost {
  display: inline-flex; align-items: center; gap: 6px; margin-top: 12px;
  padding: 4px 10px; font-size: 11px; font-weight: 500; border-radius: 5px;
  border: 1px solid hsl(var(--border)); background: transparent;
  color: hsl(var(--muted-foreground)); cursor: pointer;
}
.ia-btn-ghost:hover { background: hsl(var(--muted) / 0.6); color: hsl(var(--foreground)); }
</style>
