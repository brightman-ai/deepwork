import { computed, nextTick, ref, type ComputedRef, type Ref } from 'vue'
import type { SessionStrategy } from './types'
import type { AssistantMessage } from '@ce/components/assistant-stream/types'
import {
  applyAssistantWorkstreamEvent,
  defaultAssistantWorkstreamStatusLabel,
  readAssistantWorkstream,
  type AssistantWorkstreamEvent,
} from '@ce/components/assistant-stream/workstream'
import { createTrace, tracedFetch } from '@ce/utils/obs'

export interface WorkstreamControllerOptions {
  strategy: SessionStrategy
  /**
   * Custom status label resolver. Falls back to defaultAssistantWorkstreamStatusLabel.
   */
  statusLabelFor?: (status: string, event: AssistantWorkstreamEvent) => string
  /**
   * Called for side-effect notifications (e.g. session-created, turn-completed).
   */
  onSideEffect?: (kind: string, payload: unknown) => void
  /**
   * Ref to a pane with a scrollToBottom method. When provided, each streaming
   * event will trigger a scroll.
   */
  paneRef?: Ref<{ scrollToBottom: (force?: boolean) => void } | null>
}

export interface SurfaceProps {
  messages: AssistantMessage[]
  streaming: boolean
  streamingContent: string
  streamingStartedAt: number
  waitingStatus: string
  error: string
}

export interface WorkstreamController {
  messages: Ref<AssistantMessage[]>
  streaming: Ref<boolean>
  loading: Ref<boolean>
  error: Ref<string>
  waitingStatus: Ref<string>
  streamingStartedAt: Ref<number>
  statusTone: ComputedRef<'idle' | 'ready' | 'pending' | 'error'>
  statusLabel: ComputedRef<string>
  surfaceProps: ComputedRef<SurfaceProps>
  send(text: string): Promise<void>
  abort(): void
  loadHistory(sessionId: number | string): Promise<void>
}

export function useWorkstreamController(opts: WorkstreamControllerOptions): WorkstreamController {
  const { strategy, statusLabelFor, onSideEffect, paneRef } = opts

  const messages = ref<AssistantMessage[]>([])
  const streaming = ref(false)
  const loading = ref(false)
  const streamingStartedAt = ref(0)
  const waitingStatus = ref('准备中')
  const error = ref('')

  let abortController: AbortController | null = null
  let historyVersion = 0

  const statusTone = computed((): 'idle' | 'ready' | 'pending' | 'error' => {
    if (error.value) return 'error'
    if (streaming.value) return 'pending'
    return 'idle'
  })

  const statusLabel = computed((): string => {
    if (error.value) return '错误'
    if (streaming.value) return waitingStatus.value
    return '准备中'
  })

  const surfaceProps = computed((): SurfaceProps => ({
    messages: messages.value,
    streaming: streaming.value,
    streamingContent: '',
    streamingStartedAt: streamingStartedAt.value,
    waitingStatus: waitingStatus.value,
    error: error.value,
  }))

  async function loadHistory(sessionId: number | string): Promise<void> {
    const myVersion = ++historyVersion
    loading.value = true
    try {
      const history = await strategy.loadHistory(sessionId)
      if (myVersion !== historyVersion) return
      messages.value = history
    } catch (err) {
      if (myVersion !== historyVersion) return
      error.value = err instanceof Error ? err.message : '加载历史失败'
    } finally {
      if (myVersion === historyVersion) loading.value = false
    }
  }

  const MAX_RETRIES = 2
  const RETRY_DELAY_MS = 1000

  function isNetworkError(err: unknown): boolean {
    if (err instanceof TypeError && err.message.toLowerCase().includes('fetch')) return true
    if (err instanceof DOMException && err.name === 'NetworkError') return true
    return false
  }

  function abort(): void {
    if (abortController) {
      abortController.abort()
      abortController = null
      streaming.value = false
      waitingStatus.value = '已中断'
    }
  }

  async function send(text: string): Promise<void> {
    if (!text.trim() || streaming.value) return
    messages.value.push({ id: `u-${Date.now()}`, role: 'user', content: text })
    streaming.value = true
    streamingStartedAt.value = Date.now()
    waitingStatus.value = '准备中'
    error.value = ''

    let lastError: Error | null = null
    const wasUserAborted = () => abortController === null && !streaming.value

    try {
      const sessionId = await strategy.ensureSession()
      onSideEffect?.('session-ready', sessionId)
      const { url, body } = strategy.buildRequest(sessionId, text)

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (wasUserAborted()) break
        try {
          await streamRequest(url, body)
          onSideEffect?.('turn-completed', sessionId)
          lastError = null
          break
        } catch (err) {
          lastError = err instanceof Error ? err : new Error('发送失败')

          if (abortController === null) {
            // abort() was called — user aborted, don't retry or show error
            lastError = null
            break
          }

          if (attempt < MAX_RETRIES && isNetworkError(err)) {
            const delay = RETRY_DELAY_MS * (attempt + 1)
            waitingStatus.value = `重试中 (${attempt + 1}/${MAX_RETRIES})...`
            await new Promise(resolve => setTimeout(resolve, delay))
            if (wasUserAborted()) {
              lastError = null
              break
            }
            continue
          }

          break
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('发送失败')
    } finally {
      streaming.value = false
      waitingStatus.value = '准备中'
      abortController = null
    }

    if (lastError) {
      const errMsg = lastError.message
      error.value = errMsg
      messages.value.push({ id: `sys-${Date.now()}`, role: 'system', content: errMsg })
      // Notification suppressed in CLI-only build
    }
  }

  async function streamRequest(url: string, body: Record<string, unknown>): Promise<void> {
    abortController?.abort()
    abortController = new AbortController()
    const trace = createTrace('workstream-controller/stream')
    const response = await tracedFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: abortController.signal,
    }, trace)
    if (!response.ok) throw new Error(`发送失败 (${response.status})`)

    let assistant: AssistantMessage | null = null
    await readAssistantWorkstream(response, (event: AssistantWorkstreamEvent) => {
      assistant = applyAssistantWorkstreamEvent(event, assistant, {
        messages: messages.value,
        streamingStartedAt: streamingStartedAt.value,
        setWaitingStatus: status => { waitingStatus.value = status },
        statusLabelFor: statusLabelFor
          ?? ((s, _e) => defaultAssistantWorkstreamStatusLabel(s)),
      })
      onSideEffect?.(event.kind, event)
      if (paneRef?.value) {
        void nextTick(() => paneRef.value?.scrollToBottom(false))
      }
    })
  }

  return {
    messages,
    streaming,
    loading,
    error,
    waitingStatus,
    streamingStartedAt,
    statusTone,
    statusLabel,
    surfaceProps,
    send,
    abort,
    loadHistory,
  }
}
