/**
 * CE/Pro/Standalone edition feature gating.
 *
 * VITE_PORTALS: comma-separated list of portal IDs to enable (standalone mode).
 * If set, ONLY listed portals are enabled, regardless of tier.
 * If not set, falls back to VITE_EDITION logic.
 *
 * Default build tier is 'pro' (all portals enabled).
 * CE build requires VITE_EDITION=ce at build time.
 *
 * Portal code is never removed — only gated at route/nav registration.
 */

export type PortalTier = 'ce' | 'pro'

const PORTAL_TIERS: Record<string, PortalTier> = {
  chat:      'ce',
  workspace: 'ce',
  settings:  'ce',
  topic:     'ce',
  browser:   'pro',
  od:        'pro',
  cli:       'pro',
  claw:      'pro',
  council:   'pro',
}

export function isPortalEnabled(portalId: string): boolean {
  // Standalone mode: explicit portal list overrides edition gating
  const portalsEnv = import.meta.env.VITE_PORTALS as string | undefined
  if (portalsEnv) {
    const allowed = portalsEnv.split(',').map(s => s.trim())
    return allowed.includes(portalId)
  }
  // Edition mode: ce/pro tier check
  const tier = PORTAL_TIERS[portalId] ?? 'pro'
  const buildTier = (import.meta.env.VITE_EDITION ?? 'pro') as PortalTier
  return buildTier === 'pro' || tier === 'ce'
}
