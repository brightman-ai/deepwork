/**
 * Lightweight typed event bus (no external dependency).
 * Used for cross-view data sync via SSE events.
 */

type Handler = (...args: any[]) => void

class EventBus {
  private listeners = new Map<string, Set<Handler>>()

  on(event: string, handler: Handler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler)
  }

  off(event: string, handler: Handler): void {
    this.listeners.get(event)?.delete(handler)
  }

  emit(event: string, ...args: any[]): void {
    this.listeners.get(event)?.forEach((fn) => fn(...args))
  }
}

export const topicBus = new EventBus()
export const sessionBus = new EventBus()
