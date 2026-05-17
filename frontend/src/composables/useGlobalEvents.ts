/**
 * Global SSE event connection for cross-view data sync.
 *
 * Connects to GET /api/events and dispatches:
 *   - topic_updated   → topicBus.emit('refresh', topic_id)
 *   - session_state_changed → sessionBus.emit('state_change', event)
 *
 * Usage: call useGlobalEvents() once in App.vue or a root-level component.
 */

import { onMounted, onUnmounted, ref } from 'vue'
import { topicBus, sessionBus } from './eventBus'
import { createTrace, buildSSEUrl } from '../utils/obs'
import { apiUrl } from '../utils/runtimeBase'

export interface GlobalSSEEvent {
  type: string
  topic_id?: string
  session_id?: string
  state?: string
  [key: string]: unknown
}

// Singleton guard: only ONE global SSE connection per browser tab. [TH-0408-c5n fix]
// Prevents connection accumulation that exhausts HTTP/1.1's 6-conn-per-host limit.
let _globalInstance: EventSource | null = null

export function useGlobalEvents() {
  const connected = ref(false)
  let eventSource: EventSource | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let retryCount = 0
  let destroyed = false

  function connect() {
    if (destroyed || eventSource) return
    // Singleton: close any existing global SSE before creating new one
    if (_globalInstance) {
      _globalInstance.close()
      _globalInstance = null
    }

    const sseTrace = createTrace('sse/global')
    // Use apiUrl() so SSE goes to the same origin as cliFetch — avoids host
    // split in Wails Desktop (proxy vs direct) and shares the HTTP connection pool.
    eventSource = new EventSource(buildSSEUrl(apiUrl('/api/events'), { trace: sseTrace }))
    _globalInstance = eventSource // track singleton [TH-0408-c5n fix]

    eventSource.onopen = () => {
      connected.value = true
      retryCount = 0
    }

    // Named event listeners (SSE spec: server sends "event: xxx\ndata: ...\n\n")
    eventSource.addEventListener('topic_updated', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        if (data.topic_id) {
          topicBus.emit('refresh', data.topic_id)
        }
      } catch { /* ignore */ }
    })

    eventSource.addEventListener('session_state_changed', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        sessionBus.emit('state_change', data)
      } catch { /* ignore */ }
    })

    // Heartbeat — reset reconnect counter on ping
    eventSource.addEventListener('ping', () => {
      retryCount = 0
    })

    eventSource.onerror = () => {
      connected.value = false
      eventSource?.close()
      eventSource = null
      retryCount++

      if (retryCount > 8) {
        console.warn('[GlobalSSE] max retries exceeded, stop reconnecting')
        return
      }
      const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 30000)
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null
          connect()
        }, delay)
      }
    }
  }

  function disconnect() {
    destroyed = true
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    eventSource?.close()
    eventSource = null
    connected.value = false
  }

  onMounted(() => {
    connect()
  })

  onUnmounted(() => {
    disconnect()
  })

  return { connected }
}
