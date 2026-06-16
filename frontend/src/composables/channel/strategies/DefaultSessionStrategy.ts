import type { SessionStrategy } from '../types'
import type { AssistantBlock, AssistantMessage, AssistantToolEvent, AssistantUsageInfo } from '@ce/components/assistant-stream/types'
import { createTrace, tracedFetch, createLogger } from '@ce/utils/obs'
import type { Ref } from 'vue'

interface HistoryStep {
  id?: number
  step_number?: number
  step_type?: string
  tool_name?: string
  input?: string
  output?: string
  duration_ms?: number
  status?: string
}

interface HistoryTurn {
  id?: number
  turn_number?: number
  user_input?: string
  ai_output?: string
  duration_ms?: number
  status?: string
  error?: string
  steps?: HistoryStep[]
  /** CHG-015: accumulated thinking/reasoning text persisted per turn.
   *  Restored as a static thinking block on history load (F5). */
  reasoning?: string
  /** CHG-014 D5① per-round persisted metric columns (turns.*). Restored into the
   *  message's usage on history load so the completed-state footer shows the SAME
   *  ttft/tokens/cache the live stream did — instead of「—」. null/缺失 → undefined. */
  ttft_ms?: number | null
  input_tokens?: number | null
  output_tokens?: number | null
  cache_read_tokens?: number | null
}

export interface DefaultSessionStrategyOptions {
  /**
   * Reactive ref to the current session ID (null = not yet created).
   */
  sessionIdRef: Ref<number | null>
  /**
   * Reactive ref to whether the current session is active.
   */
  activeRef: Ref<boolean>
  /**
   * Payload for POST /api/sessions when no session exists yet.
   * Accepts a getter so callers can pass a reactive computed value.
   */
  createPayload: (() => Record<string, unknown> | null) | Record<string, unknown> | null
  /**
   * Additional query parameters forwarded to the history endpoint.
   * Accepts a getter so callers can pass a reactive computed value.
   */
  historyParams?: (() => Record<string, string | number | boolean | undefined>) | Record<string, string | number | boolean | undefined>
  /**
   * Tool mode forwarded to the input-events endpoint.
   * Accepts a getter so callers can pass a reactive computed value.
   */
  toolMode?: (() => string) | string
  /**
   * Allowed tools forwarded to the input-events endpoint.
   */
  allowedTools?: (() => string[]) | string[]
  /**
   * Memory flag forwarded to the input-events endpoint.
   */
  memoryOn?: (() => boolean | undefined) | boolean
  /**
   * CHG-015: chat AI role id forwarded to the input-events endpoint.
   * OPTIONAL — ws/topic/claw adapters that don't pass it ⇒ undefined ⇒ omitted.
   */
  roleId?: (() => string) | string
  /**
   * CHG-015: reasoning effort tier ("low"|"medium"|"high") forwarded to input-events.
   */
  effort?: (() => string) | string
  /**
   * CHG-015: vision-assist model id (used when the chosen model lacks vision).
   */
  visionAssistModelId?: (() => string) | string
  /**
   * CHG-015 需求8: image attachments (data:image/...;base64 URL or http URL) sent
   * with this turn. OPTIONAL — adapters that don't pass it ⇒ [] ⇒ omitted, so
   * ws/topic/claw are unaffected. The backend routes a vision turn when present.
   */
  images?: (() => string[]) | string[]
  /**
   * Called when a session was created (new) or continued.
   */
  onSessionCreated?: (sessionId: number) => void
}

const log = createLogger('default-session-strategy')

function parseMaybeJSON(raw?: string): unknown {
  if (!raw) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function isCanceledHistoryTurn(turn: HistoryTurn): boolean {
  const text = `${turn.status ?? ''} ${turn.error ?? ''} ${turn.ai_output ?? ''}`.toLowerCase()
  return text.includes('canceled') || text.includes('cancelled') || text.includes('context canceled')
}

function historyTools(steps: HistoryStep[]): AssistantToolEvent[] {
  return steps
    .filter(step => step.step_type === 'tool_use' && step.tool_name)
    .map((step, index) => ({
      id: `hist-tool-${step.id ?? step.step_number ?? index}`,
      name: String(step.tool_name),
      input: parseMaybeJSON(step.input),
      output: step.output,
      is_error: step.status === 'error' || step.status === 'failed',
      duration_ms: Number(step.duration_ms ?? 0),
    }))
}

function historyAssistantMessage(turn: HistoryTurn, turnNo: number): AssistantMessage | null {
  if (isCanceledHistoryTurn(turn)) return null
  const blocks: AssistantBlock[] = []
  const tools = historyTools(turn.steps ?? [])
  if (tools.length) {
    blocks.push({ type: 'tool-group', tools })
  }
  // CHG-015: thinking precedes prose. Restore a static thinking block from the
  // accumulated reasoning text (only `type`+`content` needed for history). Mirrors
  // the OD pattern in mapOdMessages.ts.
  if (turn.reasoning) {
    blocks.push({ type: 'thinking', content: String(turn.reasoning) })
  }
  if (turn.ai_output) {
    blocks.push({ type: 'text', content: String(turn.ai_output) })
  }
  if (turn.error) {
    blocks.push({ type: 'error', message: String(turn.error) })
  }
  // A turn with ONLY reasoning still renders (blocks now holds a thinking block).
  if (!blocks.length && !turn.ai_output) return null
  // CHG-014 D5① — restore the completed-state footer usage from the persisted
  // per-round columns (turns.ttft_ms / *_tokens). Without this, a history-rebuilt
  // message carries no usage → the footer shows ttft/tokens/cache as「—」even though
  // the value WAS captured and persisted (the live stream showed it, but a session
  // (re)load replaces the live message with this one). 仅填实际存在的列 → footer 诚实
  // 显「—」for genuinely absent columns, never fabricated 0.
  const usage = historyUsage(turn)
  return {
    id: `a-${turnNo}`,
    role: 'assistant',
    content: String(turn.ai_output ?? ''),
    blocks,
    elapsed_ms: Number(turn.duration_ms ?? 0),
    ...(usage ? { usage } : {}),
    status: turn.status === 'failed' ? 'failed' : 'normal',
    error: turn.error,
  }
}

// 历史 turn → footer usage。仅挂实际存在的持久化列；null/undefined 列省略 (footer 显
// 「—」)，全缺则返回 undefined（不挂空 usage）。与 OverviewPanel 同源 (turns.*)。
function historyUsage(turn: HistoryTurn): AssistantUsageInfo | undefined {
  const pick = (v: number | null | undefined): number | undefined =>
    (v === null || v === undefined) ? undefined : v
  const usage: AssistantUsageInfo = {
    ttft_ms: pick(turn.ttft_ms),
    input_tokens: pick(turn.input_tokens),
    output_tokens: pick(turn.output_tokens),
    cache_read_tokens: pick(turn.cache_read_tokens),
  }
  const hasAny = Object.values(usage).some((v) => v !== undefined)
  return hasAny ? usage : undefined
}

function resolveValue<T>(v: T | (() => T)): T {
  return typeof v === 'function' ? (v as () => T)() : v
}

export class DefaultSessionStrategy implements SessionStrategy {
  private opts: DefaultSessionStrategyOptions

  constructor(opts: DefaultSessionStrategyOptions) {
    this.opts = opts
  }

  private get createPayload() { return resolveValue(this.opts.createPayload) }
  private get historyParams() { return resolveValue(this.opts.historyParams) ?? {} }
  private get toolMode() { return resolveValue(this.opts.toolMode) ?? '' }
  private get allowedTools() { return resolveValue(this.opts.allowedTools) ?? [] }
  private get memoryOn() { return resolveValue(this.opts.memoryOn) }
  private get roleId() { return resolveValue(this.opts.roleId) ?? '' }
  private get effort() { return resolveValue(this.opts.effort) ?? '' }
  private get visionAssistModelId() { return resolveValue(this.opts.visionAssistModelId) ?? '' }
  private get images() { return resolveValue(this.opts.images) ?? [] }

  async ensureSession(): Promise<number> {
    const { sessionIdRef, activeRef, onSessionCreated } = this.opts
    const createPayload = this.createPayload
    const sessionId = sessionIdRef.value

    if (sessionId) {
      if (activeRef.value) return sessionId
      // Session exists but is inactive — call /continue to reactivate it
      const trace = createTrace('session-strategy/continue')
      const response = await tracedFetch(`/api/sessions/${sessionId}/continue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, trace)
      if (!response.ok) throw new Error(`继续会话失败 (${response.status})`)
      const data = await response.json()
      const newId = Number(data.id)
      if (!Number.isFinite(newId)) throw new Error('Invalid session ID')
      sessionIdRef.value = newId
      activeRef.value = true
      onSessionCreated?.(newId)
      return newId
    }

    if (!createPayload) {
      throw new Error('缺少会话创建参数')
    }
    const trace = createTrace('session-strategy/create')
    const response = await tracedFetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createPayload),
    }, trace)
    if (!response.ok) throw new Error(`创建会话失败 (${response.status})`)
    const data = await response.json()
    const newId = Number(data.id)
    if (!Number.isFinite(newId)) throw new Error('Invalid session ID')
    sessionIdRef.value = newId
    activeRef.value = true
    onSessionCreated?.(newId)
    return newId
  }

  buildRequest(sessionId: number | string, text: string): { url: string; body: Record<string, unknown> } {
    const toolMode = this.toolMode
    const allowedTools = this.allowedTools
    const memoryOn = this.memoryOn
    const roleId = this.roleId
    const effort = this.effort
    const visionAssistModelId = this.visionAssistModelId
    const images = this.images
    return {
      url: `/api/sessions/${sessionId}/input-events`,
      body: {
        message: text,
        tool_mode: toolMode || undefined,
        allowed_tools: allowedTools.length ? allowedTools : undefined,
        memory_on: memoryOn,
        // CHG-015: chat selectors — omitted when empty so ws/topic/claw are unaffected.
        role_id: roleId || undefined,
        effort: effort || undefined,
        vision_assist_model_id: visionAssistModelId || undefined,
        // CHG-015 需求8: image attachments — omitted when empty (ws/topic/claw send none).
        images: images.length ? images : undefined,
      },
    }
  }

  async loadHistory(sessionId: number | string): Promise<AssistantMessage[]> {
    try {
      const trace = createTrace('session-strategy/history')
      const qs = new URLSearchParams()
      for (const [key, value] of Object.entries(this.historyParams)) {
        if (value !== undefined) qs.set(key, String(value))
      }
      const response = await tracedFetch(
        `/api/sessions/${sessionId}/turns${qs.toString() ? `?${qs.toString()}` : ''}`,
        undefined,
        trace,
      )
      if (!response.ok) throw new Error(`加载会话历史失败 (${response.status})`)
      const data = await response.json()
      const next: AssistantMessage[] = []
      for (const turn of (data.turns ?? []) as HistoryTurn[]) {
        const turnNo = Number(turn.turn_number ?? turn.id ?? next.length)
        if (turn.user_input) {
          next.push({ id: `u-${turnNo}`, role: 'user', content: String(turn.user_input) })
        }
        const assistant = historyAssistantMessage(turn, turnNo)
        if (assistant) next.push(assistant)
      }
      return next
    } catch (error) {
      log.warn('history load failed', { sessionId, error: String(error) }, createTrace('session-strategy/history'))
      throw new Error('加载会话历史失败')
    }
  }
}
