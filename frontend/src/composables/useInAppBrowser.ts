/**
 * useInAppBrowser — detect embedded "in-app" webviews (WeChat, 企业微信, QQ, DingTalk, Feishu…)
 * whose browser breaks features a self-hosted server needs: Web Push service workers and clipboard
 * access silently fail inside them. When a shared ?auth= link is scanned from WeChat, the app opens
 * in that broken webview — so we guide the user out to the system browser (WeChat blocks any
 * programmatic redirect, so a guide overlay pointing at its top-right "···" menu is the only
 * reliable path).
 *
 * SSOT: shared by every deepwork host (standalone terminal, standalone teamworkbench, pro) via
 * @ce/components/InAppBrowserGuide. Pure — only navigator.userAgent — so it ports anywhere.
 */
import { ref, computed, type ComputedRef, type Ref } from 'vue'

export interface InAppBrowserInfo {
  /** true when running inside a known in-app webview that should be escaped. */
  isInApp: boolean
  /** human-readable app name (微信/企业微信/QQ/…) or '' when not in-app. */
  app: string
}

// UA keyword → app name. All of these expose a top-right "···"/menu with an "open in (external)
// browser" item, which is what the overlay points at. 企业微信 (wxwork) matches before WeChat since
// its UA contains BOTH "wxwork" and "micromessenger".
const IN_APP: Array<[RegExp, string]> = [
  [/wxwork/, '企业微信'],
  [/micromessenger/, '微信'],
  [/\bqq\//, 'QQ'],
  [/weibo/, '微博'],
  [/dingtalk/, '钉钉'],
  [/feishu|lark/, '飞书'],
]

/** Pure detector (exported for unit tests): classify a userAgent string. */
export function detectInAppBrowser(userAgent: string): InAppBrowserInfo {
  const ua = (userAgent || '').toLowerCase()
  for (const [re, name] of IN_APP) {
    if (re.test(ua)) return { isInApp: true, app: name }
  }
  return { isInApp: false, app: '' }
}

// Detected once at module load — the UA never changes within a page lifetime.
const info = ref<InAppBrowserInfo>(
  detectInAppBrowser(typeof navigator !== 'undefined' ? navigator.userAgent : ''),
)

// Session-scoped dismissal, shared across every caller so the host App and the guide agree.
const DISMISS_KEY = 'inapp_guide_dismissed'
const dismissed = ref(typeof sessionStorage !== 'undefined' && sessionStorage.getItem(DISMISS_KEY) === '1')

// blocking = we are inside a broken in-app webview AND the user has not chosen to proceed. When true
// the host must render ONLY the guide (not auth, not the app) — a broken webview should not load the
// app at all, and this makes the guide the top-priority full-screen gate with no z-index war against
// host modals.
const blocking = computed(() => info.value.isInApp && !dismissed.value)

function dismiss() {
  dismissed.value = true
  try { sessionStorage.setItem(DISMISS_KEY, '1') } catch { /* private mode → in-memory only */ }
}

export interface InAppBrowser {
  info: Ref<InAppBrowserInfo>
  blocking: ComputedRef<boolean>
  dismiss: () => void
}

export function useInAppBrowser(): InAppBrowser {
  return { info, blocking, dismiss }
}
