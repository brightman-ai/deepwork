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
import { ref } from 'vue'

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

export function useInAppBrowser() {
  return info
}
