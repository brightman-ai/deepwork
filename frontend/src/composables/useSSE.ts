/**
 * BS-03 Enhanced SSE Composable — Session-scoped event handling.
 * Manages connection lifecycle, 12 event types, reconnect + session_state_sync.
 * [Ref: T5-B5.3, TC-BS03-UIP-20]
 */
import { ref, onUnmounted } from 'vue'
import { createTrace, buildSSEUrl } from '../utils/obs'
import type {
  SSEEvent,
  SSETurnStartPayload,
  SSEContentPayload,
  SSETurnCompletePayload,
  SSESessionStatePayload,
  SSEToolStartPayload,
  SSEToolResultPayload,
  SSEStageProgressPayload,
  SSEReasoningPayload,
  SSEErrorPayload,
} from '@ce/types/sse'

export interface UseSSEOptions {
  /** Session ID to scope events */
  sessionId: number | null
  /** Called on turn_start */
  onTurnStart?: (data: SSETurnStartPayload) => void
  /** Called on content chunk */
  onContent?: (data: SSEContentPayload) => void
  /** Called on reasoning chunk */
  onReasoning?: (data: SSEReasoningPayload) => void
  /** Called on turn_complete */
  onTurnComplete?: (data: SSETurnCompletePayload) => void
  /** Called on session_state_sync (reconnect recovery) */
  onStateSync?: (data: SSESessionStatePayload) => void
  /** Called on tool_start */
  onToolStart?: (data: SSEToolStartPayload) => void
  /** Called on tool_result */
  onToolResult?: (data: SSEToolResultPayload) => void
  /** Called on stage_progress */
  onStageProgress?: (data: SSEStageProgressPayload) => void
  /** Called on error */
  onError?: (data: SSEErrorPayload) => void
  /** Called on connection status change */
  onConnectionChange?: (connected: boolean) => void
  /** Reconnect delay in ms (default 3000) */
  reconnectDelay?: number
}

export function useSSE(options: UseSSEOptions) {
  const connected = ref(false)
  const reconnecting = ref(false)
  let eventSource: EventSource | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let destroyed = false

  // SSE trace: connection-level TID, persists across reconnects
  const sseTrace = createTrace('sse/session')

  function connect() {
    if (destroyed || !options.sessionId) return
    if (eventSource) return

    const url = buildSSEUrl('/api/events', { sessionId: options.sessionId, trace: sseTrace })
    eventSource = new EventSource(url)

    eventSource.onopen = () => {
      connected.value = true
      reconnecting.value = false
      options.onConnectionChange?.(true)
    }

    eventSource.onmessage = (e) => {
      try {
        const event: SSEEvent = JSON.parse(e.data)
        dispatch(event)
      } catch {
        // Ignore malformed events
      }
    }

    // Listen for specific named events
    const eventTypes = [
      'turn_start', 'content', 'reasoning', 'turn_complete',
      'session_state_sync', 'tool_start', 'tool_result',
      'stage_progress', 'error', 'done', 'ping',
    ]
    for (const type of eventTypes) {
      eventSource.addEventListener(type, (e: Event) => {
        try {
          const me = e as MessageEvent
          const data = JSON.parse(me.data)
          dispatch({ type, data } as SSEEvent)
        } catch {
          // Ignore
        }
      })
    }

    eventSource.onerror = () => {
      connected.value = false
      reconnecting.value = true
      options.onConnectionChange?.(false)
      cleanup()
      scheduleReconnect()
    }
  }

  function dispatch(event: SSEEvent) {
    switch (event.type) {
      case 'turn_start':
        options.onTurnStart?.(event.data as SSETurnStartPayload)
        break
      case 'content':
        options.onContent?.(event.data as SSEContentPayload)
        break
      case 'reasoning':
        options.onReasoning?.(event.data as SSEReasoningPayload)
        break
      case 'turn_complete':
        options.onTurnComplete?.(event.data as SSETurnCompletePayload)
        break
      case 'session_state_sync':
        options.onStateSync?.(event.data as SSESessionStatePayload)
        break
      case 'tool_start':
        options.onToolStart?.(event.data as SSEToolStartPayload)
        break
      case 'tool_result':
        options.onToolResult?.(event.data as SSEToolResultPayload)
        break
      case 'stage_progress':
        options.onStageProgress?.(event.data as SSEStageProgressPayload)
        break
      case 'error':
        options.onError?.(event.data as SSEErrorPayload)
        break
    }
  }

  function cleanup() {
    eventSource?.close()
    eventSource = null
  }

  function scheduleReconnect() {
    if (destroyed) return
    if (reconnectTimer) return
    const delay = options.reconnectDelay ?? 3000
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  function disconnect() {
    destroyed = true
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    cleanup()
    connected.value = false
    reconnecting.value = false
  }

  onUnmounted(() => {
    disconnect()
  })

  return {
    connected,
    reconnecting,
    connect,
    disconnect,
  }
}
