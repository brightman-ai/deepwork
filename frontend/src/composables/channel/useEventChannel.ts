/**
 * Global SSE channel composable — connects to /api/events.
 * Wraps useGlobalEvents with a typed event subscription API.
 * Singleton: one connection per browser tab (reuses existing global SSE infrastructure).
 *
 * Usage:
 *   const channel = useEventChannel()
 *   channel.on('notification', handler)
 *   channel.on('topic_updated', handler)
 */

import { ref, onUnmounted } from 'vue'
import { createTrace, buildSSEUrl } from '@ce/utils/obs'
import { apiUrl } from '@ce/utils/runtimeBase'

export interface ChannelEvent {
  type: string
  [key: string]: unknown
}

type EventHandler = (data: ChannelEvent) => void

// Singleton SSE connection shared across all useEventChannel() callers
let _es: EventSource | null = null
let _connected = ref(false)
let _retryCount = 0
let _retryTimer: ReturnType<typeof setTimeout> | null = null
const _handlers = new Map<string, Set<EventHandler>>()

function emitToHandlers(type: string, data: ChannelEvent): void {
  _handlers.get(type)?.forEach(fn => fn(data))
  _handlers.get('*')?.forEach(fn => fn(data))
}

function doConnect(): void {
  if (_es) return

  const trace = createTrace('sse/channel')
  const url = buildSSEUrl(apiUrl('/api/events'), { trace })
  _es = new EventSource(url)

  _es.onopen = () => {
    _connected.value = true
    _retryCount = 0
  }

  // Generic message fallback
  _es.onmessage = (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data) as ChannelEvent
      if (data?.type) emitToHandlers(data.type, data)
    } catch { /* ignore malformed */ }
  }

  // Named event listeners for all known server-sent event types
  const namedTypes = [
    'topic_updated',
    'session_state_changed',
    'notification',
    'ping',
  ]
  for (const type of namedTypes) {
    _es.addEventListener(type, (e: Event) => {
      try {
        const me = e as MessageEvent
        const data = JSON.parse(me.data) as ChannelEvent
        emitToHandlers(type, { ...data, type })
      } catch { /* ignore */ }
    })
  }

  _es.onerror = () => {
    _connected.value = false
    _es?.close()
    _es = null
    _retryCount++

    if (_retryCount > 8) return

    const delay = Math.min(1000 * Math.pow(2, _retryCount - 1), 30_000)
    if (!_retryTimer) {
      _retryTimer = setTimeout(() => {
        _retryTimer = null
        doConnect()
      }, delay)
    }
  }
}

export interface UseEventChannelReturn {
  /** Subscribe to a specific event type. Returns an unsubscribe function. */
  on: (eventType: string, handler: EventHandler) => () => void
  /** Reactive connection status */
  connected: ReturnType<typeof ref<boolean>>
  /** Last received event */
  lastEvent: ReturnType<typeof ref<ChannelEvent | null>>
}

export function useEventChannel(): UseEventChannelReturn {
  const lastEvent = ref<ChannelEvent | null>(null)

  function on(eventType: string, handler: EventHandler): () => void {
    if (!_handlers.has(eventType)) {
      _handlers.set(eventType, new Set())
    }
    const wrappedHandler: EventHandler = (data) => {
      lastEvent.value = data
      handler(data)
    }
    _handlers.get(eventType)!.add(wrappedHandler)
    doConnect()

    return () => {
      _handlers.get(eventType)?.delete(wrappedHandler)
    }
  }

  onUnmounted(() => {
    // Individual composable instances do not close the shared connection.
    // The singleton stays alive for the tab lifetime.
  })

  return {
    on,
    connected: _connected,
    lastEvent,
  }
}
