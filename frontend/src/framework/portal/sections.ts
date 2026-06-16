import type { Component } from 'vue'

/**
 * Portal Section Contribution Registry — SSOT for "compose a portal's content from sections
 * contributed by multiple repos" (the counterpart to `definePortal`, which composes the NAV).
 *
 * `definePortal` lets a repo add a whole portal (one nav entry → one route). This registry lets
 * a repo contribute SECTIONS into an extension point (a `slot`) that some portal renders. A
 * section is defined ONCE in its owning repo and appears in every host that imports it — no
 * per-host duplication, no divergence.
 *
 * Motivating case: the terminal owns the Cloudflare-tunnel/auth "Network" settings section. It
 * registers it under slot `'settings'` once; both the standalone terminal build and the pro
 * build (which side-effect-imports the terminal sections) render it. See
 * `docs/portal-section-registry/DESIGN.md` (in deepwork-terminal).
 *
 * Integration model = composition root: each feature repo exposes a side-effect entry that
 * registers its contributions; the compiled host's import graph IS the manifest. Because `@ce`
 * is a SOURCE alias (Vite-deduped, not a versioned npm dep), every build has exactly ONE
 * registry instance, so cross-repo registrations land in the same table deterministically.
 */
export interface PortalSection {
  /**
   * Extension point this section mounts into. Convention:
   *   '<portal>'            → the portal's default section list, e.g. 'settings'
   *   '<portal>.<region>'   → a named sub-region, e.g. 'settings.advanced', 'cli.toolbar'
   * One flat string keeps multi-portal + multi-region support with zero extra structure.
   */
  slot: string
  /** Globally-unique, namespaced by owner repo to avoid cross-repo collisions: 'terminal.network'. */
  id: string
  /** Optional grouping within the slot (e.g. a settings category cluster). */
  group?: string
  label: string
  icon?: Component
  /** Sort key within the slot; equal/absent keeps registration order. */
  order?: number
  /** Content component; supports lazy `() => import('./X.vue')` so section code is code-split. */
  component: Component | (() => Promise<Component>)
  /**
   * Runtime gate. A host may import a repo's sections wholesale; `enabled()` lets a section
   * hide itself when it doesn't apply (e.g. the tunnel section only when `/api/tunnel` exists).
   * Absent = always shown.
   */
  enabled?: () => boolean
}

const registry = new Map<string, PortalSection[]>()

/**
 * Register a section into its slot. Idempotent by (slot, id) so repeated module evaluation
 * (HMR, a repo imported from two entry points) never double-inserts.
 */
export function definePortalSection(section: PortalSection): void {
  const list = registry.get(section.slot) ?? []
  if (list.some((s) => s.id === section.id)) return
  list.push(section)
  registry.set(section.slot, list)
}

/**
 * The sections a host should render for a slot: `enabled()`-filtered and `order`-sorted.
 * A section-composable portal's shell renders exactly this — it never hard-codes a section list.
 */
export function getPortalSections(slot: string): PortalSection[] {
  const list = registry.get(slot) ?? []
  return list
    .filter((s) => (s.enabled ? s.enabled() : true))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

/** Test/HMR helper — drop all registrations for a slot (or everything when omitted). */
export function __clearPortalSections(slot?: string): void {
  if (slot === undefined) registry.clear()
  else registry.delete(slot)
}
