import { provide, inject } from 'vue'

// Injection key — unique symbol avoids collisions across nested portals
const PORTAL_EVENTS_KEY = Symbol('portalEvents')

type Handler = (payload?: unknown) => void

class PortalEventBus {
  private listeners = new Map<string, Set<Handler>>()

  emit(event: string, payload?: unknown): void {
    this.listeners.get(event)?.forEach((fn) => fn(payload))
  }

  on(event: string, handler: Handler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler)
  }

  off(event: string, handler: Handler): void {
    this.listeners.get(event)?.delete(handler)
  }

  clear(): void {
    this.listeners.clear()
  }
}

export interface PortalEventBusAPI {
  emit: (event: string, payload?: unknown) => void
  on:   (event: string, handler: Handler) => void
  off:  (event: string, handler: Handler) => void
}

/**
 * Call once in the portal shell component to create and provide the event bus.
 * Returns the bus so the shell can also emit events directly.
 *
 * Common events:
 *   'artifact.created' | 'artifact.updated'
 *   'browser.started'  | 'browser.stopped'
 *   'terminal.started'
 *   'companion.requested'
 *   'session.selected' | 'session.created'
 */
export function providePortalEvents(): PortalEventBusAPI {
  const bus = new PortalEventBus()
  provide(PORTAL_EVENTS_KEY, bus)
  return bus
}

/**
 * Call in pane components to receive the portal-scoped event bus.
 * Throws if called outside a portal shell that called providePortalEvents().
 */
export function injectPortalEvents(): PortalEventBusAPI {
  const bus = inject<PortalEventBus>(PORTAL_EVENTS_KEY)
  if (!bus) {
    throw new Error(
      '[usePortalEvents] No portal event bus found. ' +
      'Ensure providePortalEvents() was called in the parent portal shell.',
    )
  }
  return bus
}

/**
 * Convenience composable for panes: wraps injectPortalEvents with a safe fallback.
 * Returns null if no bus is available (e.g., pane rendered outside a portal during dev).
 */
export function usePortalEvents(): PortalEventBusAPI | null {
  try {
    return injectPortalEvents()
  } catch {
    return null
  }
}
