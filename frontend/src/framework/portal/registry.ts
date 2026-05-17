import type { PortalDescriptor } from './types'

export interface PortalRegistry {
  register(descriptor: PortalDescriptor): void
  get(id: string): PortalDescriptor | undefined
  getAll(): PortalDescriptor[]
  has(id: string): boolean
}

export function createPortalRegistry(): PortalRegistry {
  const portals = new Map<string, PortalDescriptor>()

  function register(descriptor: PortalDescriptor): void {
    if (portals.has(descriptor.id)) {
      console.warn(`[PortalRegistry] Portal "${descriptor.id}" is already registered. Overwriting.`)
    }
    portals.set(descriptor.id, descriptor)
  }

  function get(id: string): PortalDescriptor | undefined {
    return portals.get(id)
  }

  function getAll(): PortalDescriptor[] {
    return Array.from(portals.values())
  }

  function has(id: string): boolean {
    return portals.has(id)
  }

  return { register, get, getAll, has }
}

/** Singleton registry — import this in app bootstrap or portal index files */
export const portalRegistry = createPortalRegistry()
