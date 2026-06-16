/**
 * settingsApi — host-injected authed fetch for SHARED settings sections.
 *
 * Some settings sections are owned by @ce (the shared core) yet must call a host-specific,
 * AUTHED backend — e.g. the Internet Access / Cloudflare-tunnel section exposes "this server"
 * to the internet, and "this server" is the terminal (cli-auth) in standalone but pro (its own
 * auth) when embedded. @ce must NOT reverse-depend on terminal/pro, so the concrete fetch is
 * injected by the host once at startup; shared sections call `settingsApiFetch`.
 *
 * Default = same-origin `fetch(apiUrl(path))` with no auth — enough for unauthed endpoints; any
 * host that needs auth (terminal, pro) overrides via `setSettingsApiFetch` so its credentials
 * ride along. This is a service locator (one function), not provide/inject, so a section deep in
 * the tree needs no provider ancestor.
 */
import { apiUrl } from '@ce/utils/runtimeBase'

export type SettingsApiFetch = (path: string, init?: RequestInit) => Promise<Response>

const defaultFetch: SettingsApiFetch = (path, init) => fetch(apiUrl(path), init)

let _fetch: SettingsApiFetch = defaultFetch

/** Host wires its authed fetch (e.g. terminal's cliFetch) once at startup. */
export function setSettingsApiFetch(fn: SettingsApiFetch): void {
  _fetch = fn
}

/** Shared settings sections call this; it routes through whatever the host injected. */
export function settingsApiFetch(path: string, init?: RequestInit): Promise<Response> {
  return _fetch(path, init)
}
