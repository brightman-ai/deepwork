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
  /**
   * owner 对称 steer: 把补充说明插入正在跑的运行轮（POST input-events）。乐观上屏用户
   * 气泡；AI 对补充的反应出现在已打开的主轮流上（不是这次 POST 的响应体）。当前轮不支持
   * steer（非订阅版/传输不支持）时后端落回 error 事件，此处丢弃乐观气泡 + 报错。
   */
  steer(text: string): Promise<void>
  /** Re-send the last turn that errored out (used by the surface 重试 button). */
  retry(): Promise<void>
  abort(): void
  loadHistory(sessionId: number | string): Promise<void>
}

/**
 * Map a raw send/stream error onto a friendly, actionable 简体中文 message. The
 * upstream layers leak raw English strings — an axios "timeout of 30000ms exceeded"
 * or a backend "context canceled" — that read as a crash to the user. We classify by
 * substring (the only stable signal across fetch/axios/backend) and never surface the
 * raw English to the timeline; the original is still in the console/TID for diagnosis.
 */
export function friendlyStreamError(raw: string): string {
  const s = (raw || '').toLowerCase()
  if (s.includes('timeout') || s.includes('timed out') || s.includes('deadline')) {
    return '生成超时：上游模型响应过慢或暂时不可用。请点「重试」，或稍后再试。'
  }
  if (s.includes('context canceled') || s.includes('context cancelled') || s.includes('canceled') || s.includes('cancelled')) {
    return '本轮生成已被中断（上游取消或超时）。请点「重试」再发一次。'
  }
  if (s.includes('failed to fetch') || s.includes('networkerror') || s.includes('network error') || s.includes('econnrefused')) {
    return '网络连接失败：未能连上服务。请检查网络后点「重试」。'
  }
  // W1G1: a backend business error rides the stream as a raw English `error` event —
  // e.g. `API error 400: {"error":{"message":"...you passed glm-5 ... not supported"}}`.
  // It is NOT a thrown HTTP status, so it skipped the (4xx)/(5xx) branches above and
  // leaked raw to the bubble. Classify the common HTTP-status-in-text shapes (`API error
  // 400` / `HTTP 500`) and, for a 4xx model/route error, surface a model-specific hint —
  // never the raw JSON. The original text stays in the console for triage.
  if (/(api error|http)\s*4\d\d/.test(s) || /\(\s*4\d\d\s*\)/.test(raw)) {
    // Name the rejected model when the upstream says so ("you passed glm-5"), but DON'T
    // splice the whole English provider sentence into the Chinese line — that read as
    // 中英夹生 and double-punctuated ("glm-5.。"). A clean, model-named Chinese hint, or a
    // generic Chinese fallback. The raw English stays in the console for triage.
    const model = extractRejectedModel(raw)
    if (model) return `所选模型「${model}」不可用或路由错误，请改选其它模型后点「重试」。`
    return '所选模型不可用或请求被拒绝（4xx）。请改选其它模型，或检查 Provider 配置后点「重试」。'
  }
  if (/(api error|http)\s*5\d\d/.test(s) || /\(\s*5\d\d\s*\)/.test(raw)) {
    return '服务暂时不可用（5xx）。请稍后点「重试」。'
  }
  // Already Chinese (our own thrown errors) → pass through; otherwise a generic friendly line.
  if (/[一-鿿]/.test(raw)) return raw
  return '生成失败：请点「重试」再发一次。'
}

/**
 * Best-effort pull of JUST the rejected model name out of a raw backend/provider error
 * string like `API error 400: {"error":{"message":"...but you passed glm-5."}}`. We only
 * want the model id for a clean Chinese hint — NOT the whole English sentence (that read as
 * 中英夹生 + double-punctuated in the timeline). Returns the bare model id or '' when none
 * is found. Defensive — a malformed body must never throw.
 */
function extractRejectedModel(raw: string): string {
  const text = String(raw || '')
  // OpenAI-compatible providers commonly phrase the route rejection as
  // "...but you passed <model>." / "you passed `<model>`". Capture the token only.
  const passed = text.match(/you passed[\s:]+["'`]?([\w.\-:/]+)["'`]?/i)
  if (passed?.[1]) return sanitizeModelToken(passed[1])
  // Some providers say `model <model> ... not found/supported`.
  const named = text.match(/\bmodel[\s:]+["'`]?([\w.\-:/]+)["'`]?\b[^]*?(?:not\s+(?:found|supported|exist))/i)
  if (named?.[1]) return sanitizeModelToken(named[1])
  return ''
}

// Trim trailing sentence punctuation a provider may glue onto the model token (e.g.
// "glm-5." → "glm-5") so the Chinese wrapper never produces a doubled period ("glm-5。。").
function sanitizeModelToken(token: string): string {
  return token.replace(/[.,;:。，；：]+$/u, '').trim().slice(0, 64)
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
  // Remember the last user text so the surface 重试 button can re-send the same turn
  // after a timeout/failure (the optimistic bubble + waiting state come back too).
  let lastSentText = ''

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
    lastSentText = text
    // First-turn race fix: a freshly-created session routes the adapter in, whose
    // threadId watch kicks off loadHistory() (empty for a new session) just before the
    // first-brief send lands here. That in-flight load would resolve AFTER this optimistic
    // bubble is pushed and overwrite messages.value with the empty history — the user's
    // message vanishes back to the "开始对话" placeholder (looks unsent → 重复提交). Bump
    // historyVersion so any load started before this send bails at its post-await guard
    // instead of clobbering the optimistic bubble. A load started AFTER (explicit nav
    // reload) gets a higher version and still wins.
    historyVersion++
    // The invalidated load's finally block won't flip loading off (its version is stale),
    // so clear it here — a send means we're no longer "加载历史" (the overlay would
    // otherwise hang over the new bubble).
    loading.value = false
    messages.value.push({ id: `u-${Date.now()}`, role: 'user', content: text })
    streaming.value = true
    streamingStartedAt.value = Date.now()
    waitingStatus.value = '生成中'
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
      waitingStatus.value = '生成中'
      abortController = null
    }

    if (lastError) {
      // Friendly, actionable 简体中文 in the error banner (which now carries a 重试
      // button) — never the raw English "timeout of 30000ms exceeded" / "context
      // canceled". The single banner replaces the old raw `system` timeline message
      // so the user sees one clear recovery point, not a wall of English.
      error.value = friendlyStreamError(lastError.message)
    }
  }

  /**
   * owner 对称 steer: streaming 态下把补充说明插入正在跑的运行轮，而不是新开一轮。
   * 后端 POST /api/sessions/:id/input-events 在有在飞轮时 steer 成功，SSE 回一个
   * `{kind:'status', status:'steered', meta:{steered:true}}` 即关闭 —— AI 对这次补充的
   * 反应出现在已打开的主轮流上（不是这个 POST 的响应体）。若后端不可 steer（非订阅版/
   * 传输不支持）→回一个 error 事件，此处丢弃乐观气泡 + 报错，不静默吞。
   */
  async function steer(text: string): Promise<void> {
    if (!text.trim() || !streaming.value) return
    // steered:true → UserBubble 显「↩ 已插入本轮」意符, 与普通轮视觉区分(设计心理学: 可视清晰)。
    const bubble: AssistantMessage = { id: `u-steer-${Date.now()}`, role: 'user', content: text, steered: true }
    messages.value.push(bubble) // 乐观: 用户补充的话立即上屏(插入运行轮, 反应走主流)
    const drop = () => {
      const i = messages.value.indexOf(bubble)
      if (i >= 0) messages.value.splice(i, 1)
    }
    try {
      const sessionId = await strategy.ensureSession()
      const { url, body } = strategy.buildRequest(sessionId, text)
      const trace = createTrace('workstream-controller/steer')
      const resp = await tracedFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, trace)
      if (!resp.ok) throw new Error(`插入失败 (${resp.status})`)
      let steered = false
      let streamErr = ''
      await readAssistantWorkstream(resp, (ev) => {
        if (ev.kind === 'status' && (ev.status === 'steered' || ev.meta?.steered)) steered = true
        if (ev.kind === 'error') streamErr = ev.content || ev.error || '插入失败'
      })
      if (streamErr) throw new Error(streamErr)
      if (!steered) throw new Error('当前轮不支持插入(该运行时无法中途注入),请等待完成后再发')
      // steered → 保留乐观气泡; AI 对本次补充的反应会出现在已打开的主轮流上。
    } catch (e) {
      drop()
      error.value = e instanceof Error ? e.message : '插入失败'
    }
  }

  /** Re-send the last user turn after a failure (surface 重试 button). */
  async function retry(): Promise<void> {
    if (streaming.value || !lastSentText.trim()) return
    error.value = ''
    // The failed turn left a trailing orphan user bubble (no assistant reply landed).
    // send() re-pushes the optimistic bubble, so drop the orphan first to avoid a
    // duplicated "我说的话" pair. Only pop when the tail is exactly that orphan.
    const tail = messages.value[messages.value.length - 1]
    if (tail?.role === 'user' && tail.content === lastSentText) {
      messages.value.pop()
    }
    await send(lastSentText)
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

    // W1G1: a backend business failure (e.g. a 400 model/route error) opens the stream
    // with HTTP 200 then sends a single `error` event. Capture its raw text and THROW
    // after the stream drains so it flows through the SAME friendly-error + 重试 path as
    // a network/timeout failure — instead of silently landing as a raw English block in
    // the bubble with no banner and no retry. We also suppress that raw in-bubble error
    // block (it duplicates the friendly banner — the reported "×2 重复").
    let streamError = ''
    let assistant: AssistantMessage | null = null
    await readAssistantWorkstream(response, (event: AssistantWorkstreamEvent) => {
      if (event.kind === 'error') {
        // Record the first error and skip applying it as an in-bubble block (the friendly
        // banner carries the recovery). Later events (a trailing done) still drain.
        if (!streamError) streamError = event.content || event.error || '执行失败'
        onSideEffect?.(event.kind, event)
        return
      }
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

    // A pure-error turn produced no assistant content → drop the empty optimistic
    // assistant placeholder so the bubble doesn't linger blank under the banner.
    if (streamError) {
      const tail = messages.value[messages.value.length - 1]
      if (tail && tail.role === 'assistant' && !tail.content && !(tail.blocks?.length)) {
        messages.value.pop()
      }
      throw new Error(streamError)
    }
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
    steer,
    retry,
    abort,
    loadHistory,
  }
}
