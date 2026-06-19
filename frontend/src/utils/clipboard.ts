/**
 * copyTextToClipboard — SSOT for writing text to the OS clipboard across deepwork apps
 * (deepwork-terminal, deepwork-pro). Lives in @ce (the base layer) so every layer shares
 * one correct implementation instead of re-deriving the iOS/HTTP fallback per component.
 *
 * Why a helper: `navigator.clipboard.writeText` requires a SECURE context. On iOS Safari over
 * plain HTTP (e.g. a `http://host:PORT` LAN/Tailscale link, or before a Cloudflare HTTPS tunnel
 * is opened) `navigator.clipboard` is UNDEFINED, so a bare writeText silently fails — which is
 * exactly why "复制" buttons did nothing on HTTP. We fall back to the legacy
 * `document.execCommand('copy')` path, which DOES work on insecure origins.
 *
 * MUST be called from within a user-gesture handler (button tap) — the execCommand fallback is
 * only permitted inside a gesture, and it runs synchronously.
 *
 * @returns true on success, false on hard failure (caller decides how to surface it).
 */
export function copyTextToClipboard(text: string): Promise<boolean> {
  // Secure-context fast path (HTTPS / localhost). On failure, fall through to execCommand.
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => copyViaExecCommand(text),
    )
  }
  return Promise.resolve(copyViaExecCommand(text))
}

/**
 * Legacy copy via a focused, contentEditable, explicitly-selected element. iOS Safari requires
 * all of: contentEditable, focus, a Range over the node, AND setSelectionRange — a bare
 * offscreen `ta.select()` silently no-ops. Keep it in-viewport but invisible.
 */
function copyViaExecCommand(text: string): boolean {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.readOnly = false
  ta.contentEditable = 'true'
  ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;font-size:16px'
  document.body.appendChild(ta)
  ta.focus()
  const range = document.createRange()
  range.selectNodeContents(ta)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
  ta.setSelectionRange(0, text.length)
  let threw = false
  try {
    document.execCommand('copy')
  } catch {
    threw = true
  }
  sel?.removeAllRanges()
  document.body.removeChild(ta)
  // iOS Safari's execCommand('copy') often returns false even when the copy succeeded, so its
  // boolean is unreliable — treat "did not throw" as success.
  return !threw
}
