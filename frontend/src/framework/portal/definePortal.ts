import type { PortalDescriptor } from './types'

/**
 * Define and validate a portal descriptor.
 * Returns a frozen (immutable) descriptor to prevent accidental mutation.
 *
 * Usage:
 *   export const chatPortal = definePortal({ id: 'chat', ... })
 */
export function definePortal(descriptor: PortalDescriptor): Readonly<PortalDescriptor> {
  // Validate required fields
  if (!descriptor.id || typeof descriptor.id !== 'string') {
    throw new Error('[definePortal] descriptor.id is required and must be a non-empty string')
  }
  if (!descriptor.label || typeof descriptor.label !== 'string') {
    throw new Error(`[definePortal] descriptor.label is required (portal "${descriptor.id}")`)
  }
  if (!descriptor.icon) {
    throw new Error(`[definePortal] descriptor.icon is required (portal "${descriptor.id}")`)
  }
  if (!descriptor.route || typeof descriptor.route !== 'string') {
    throw new Error(`[definePortal] descriptor.route is required (portal "${descriptor.id}")`)
  }
  if (!descriptor.scenarios || typeof descriptor.scenarios !== 'object') {
    throw new Error(`[definePortal] descriptor.scenarios is required (portal "${descriptor.id}")`)
  }
  if (!descriptor.scenarios.initial || typeof descriptor.scenarios.initial !== 'string') {
    throw new Error(`[definePortal] descriptor.scenarios.initial is required (portal "${descriptor.id}")`)
  }
  if (!descriptor.scenarios.states || typeof descriptor.scenarios.states !== 'object') {
    throw new Error(`[definePortal] descriptor.scenarios.states is required (portal "${descriptor.id}")`)
  }
  if (!(descriptor.scenarios.initial in descriptor.scenarios.states)) {
    throw new Error(
      `[definePortal] scenarios.initial "${descriptor.scenarios.initial}" ` +
      `not found in scenarios.states (portal "${descriptor.id}")`,
    )
  }
  if (!Array.isArray(descriptor.routes) || descriptor.routes.length === 0) {
    throw new Error(`[definePortal] descriptor.routes must be a non-empty array (portal "${descriptor.id}")`)
  }

  return Object.freeze({ ...descriptor })
}
