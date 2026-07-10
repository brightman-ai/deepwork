import type {
  AssistantBlock,
  AssistantMessage,
  AssistantTaskItem,
  AssistantToolEvent,
  AssistantUsageInfo,
} from './types'

// pendingModelFallback 跨"status 帧先于 assistant 消息创建"的窗口持久 model_fallback。
// owner CLI/订阅版路径的 model_fallback 只骑在开场 status 帧上 —— 那时 assistant 消息还没建、
// applyWorkstreamEvent 返回 null，若只在 result 存在时 stamp 就漏了。按 options.messages 这个
// 稳定的 reactive 数组做键持久最近见到的 fallback，后续帧建出消息时补 stamp。仍是 fallback 层：
// 绝不盖 usage.model 权威值、不覆盖已有 runtime.model；messages 数组被丢弃时整个条目自动 GC。
const pendingModelFallback = new WeakMap<AssistantMessage[], string>()

export interface AssistantWorkstreamEvent {
  kind: string
  status?: string
  content?: string
  tool?: Partial<AssistantToolEvent>
  skill?: Partial<AssistantToolEvent>
  name?: string
  input?: unknown
  output?: string
  error?: string
  task?: {
    items?: AssistantTaskItem[]
    title?: string
    status?: string
  }
  usage?: Record<string, unknown>
  done?: Record<string, unknown>
  meta?: Record<string, unknown>
  data?: Record<string, unknown>
}

export interface AssistantWorkstreamApplyOptions {
  messages: AssistantMessage[]
  streamingStartedAt: number
  setWaitingStatus?: (status: string) => void
  statusLabelFor?: (status: string, event: AssistantWorkstreamEvent) => string
  now?: () => number
}

export async function readAssistantWorkstream(
  response: Response,
  onEvent: (event: AssistantWorkstreamEvent) => void | Promise<void>,
): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('缺少流式响应')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })

    const frames = buffer.split('\n\n')
    buffer = done ? '' : frames.pop() ?? ''

    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue
        const raw = line.slice(5).trim()
        if (!raw || raw === '[DONE]') continue
        await onEvent(JSON.parse(raw) as AssistantWorkstreamEvent)
      }
    }

    if (done) break
  }
}

// applyAssistantWorkstreamEvent applies one frame to the running message, then layers
// the diagnostic model FALLBACK on top of the result. SSOT: usage.model (event.meta.model /
// event.done.model / event.usage.model, folded by usageFrom → applyWorkstreamEvent) is the
// AUTHORITATIVE layer — the runtime's own honest report of the model it actually used.
// event.meta.model_fallback (backend collab drive: the configured/dispatched model id, e.g.
// a subscription-plan claude PTY that never reports a model at all) is a strictly WEAKER
// fallback layer — it may only fill result.runtime.model when the authoritative layer left
// it empty, and must NEVER touch result.usage.model. Getting this precedence backwards would
// let a stale configured id overwrite a real (but different) model the runtime later reports.
export function applyAssistantWorkstreamEvent(
  event: AssistantWorkstreamEvent,
  current: AssistantMessage | null,
  options: AssistantWorkstreamApplyOptions,
): AssistantMessage | null {
  // owner CLI 的 model_fallback 可能只在消息创建前的 status 帧到达 → 先持久到 WeakMap，
  // 使后续帧真正建出消息时仍能补 stamp（此帧 result 为 null 也不丢）。
  const fbNow = stringFrom(event.meta?.model_fallback)
  if (fbNow) pendingModelFallback.set(options.messages, fbNow)
  const result = applyWorkstreamEvent(event, current, options)
  const fallback = fbNow || pendingModelFallback.get(options.messages)
  if (fallback && result && !result.runtime?.model) {
    result.runtime = { ...result.runtime, model: fallback }
  }
  return result
}

// applyWorkstreamEvent is the original per-frame reducer, unchanged in logic — kept as an
// inner function so applyAssistantWorkstreamEvent can post-process its result (model_fallback
// layering above) without touching any of the switch arms below, in particular
// ensureAssistantMessage's REACTIVE PROXY return (see its comment): every `current`/`msg`
// this function threads through IS that proxy, and this wrapper must never re-wrap or copy it.
function applyWorkstreamEvent(
  event: AssistantWorkstreamEvent,
  current: AssistantMessage | null,
  options: AssistantWorkstreamApplyOptions,
): AssistantMessage | null {
  switch (event.kind) {
    case 'status': {
      const status = options.statusLabelFor?.(event.content || event.status || '处理中', event)
        ?? defaultAssistantWorkstreamStatusLabel(event.content || event.status || '处理中')
      options.setWaitingStatus?.(status)
      if (current) updateWaitingStatus(current, status, options.streamingStartedAt)
      return current
    }
    case 'context_start':
      options.setWaitingStatus?.('读取上下文')
      if (current) updateWaitingStatus(current, '读取上下文', options.streamingStartedAt)
      return current
    case 'context_done':
      options.setWaitingStatus?.('上下文就绪')
      if (current) updateWaitingStatus(current, '上下文就绪', options.streamingStartedAt)
      return current
    case 'text': {
      const msg = ensureAssistantMessage(current, options)
      appendText(msg, event.content || '', options)
      return msg
    }
    case 'thinking': {
      const msg = ensureAssistantMessage(current, options)
      appendThinking(msg, event.content || '', options)
      return msg
    }
    case 'tool_start':
    case 'skill_start': {
      const msg = ensureAssistantMessage(current, options)
      upsertTool(msg, normalizeToolEvent(event, event.kind === 'skill_start' ? 'Skill' : 'Tool', options, false))
      return msg
    }
    case 'tool_result':
    case 'skill_result': {
      const msg = ensureAssistantMessage(current, options)
      // CHG-015 P8: a result frame means the tool COMPLETED — stamp done=true so the
      // spinner stops even when the backend omits an empty `output` (omitempty). Keying
      // termination off output presence left empty-success tools spinning forever.
      upsertTool(msg, normalizeToolEvent(event, event.kind === 'skill_result' ? 'Skill' : 'Tool', options, true))
      return msg
    }
    case 'usage': {
      const msg = ensureAssistantMessage(current, options)
      msg.live_usage = usageFrom(event)
      return msg
    }
    case 'permission_request': {
      const msg = ensureAssistantMessage(current, options)
      appendBlock(msg, {
        type: 'permission',
        content: event.content || event.name || '需要用户确认',
        effectClass: typeof event.meta?.effect_class === 'string' ? event.meta.effect_class : undefined,
      })
      return msg
    }
    case 'task_update': {
      const msg = ensureAssistantMessage(current, options)
      replaceTaskPlan(msg, event.task?.items ?? [])
      return msg
    }
    case 'error': {
      const msg = ensureAssistantMessage(current, options)
      appendBlock(msg, { type: 'error', message: event.content || event.error || '执行失败' })
      msg.streaming = false
      msg.status = 'failed'
      msg.error = event.content || event.error
      return msg
    }
    case 'done': {
      if (current) {
        current.streaming = false
        current.elapsed_ms = elapsedFrom(event, options)
        const blocks = removeWaitingBlocks(current.blocks ?? [])
        settleThinking(blocks, options.now) // turn done → any lingering thinking block collapses + freezes
        current.blocks = blocks
        // Merge, don't overwrite: the Done frame carries the authoritative ttft (and
        // duration), but token/cache figures accrued from the per-round `usage` events.
        // A plain assign would let Done's absent fields blank out cache_read/tokens
        // (→ footer「—」). mergeUsage keeps each field's last real value.
        current.usage = mergeUsage(current.live_usage, usageFrom(event))
        current.live_usage = current.usage
      }
      return current
    }
    default:
      return current
  }
}

export function defaultAssistantWorkstreamStatusLabel(status: string): string {
  switch (status) {
    case 'initializing': return '初始化中'
    case 'spawning': return '启动进程'
    case 'loading_context': return '读取上下文'
    case 'context_done': return '上下文就绪'
    case 'calling_model':
    case 'llm_calling': return '调用模型'
    case 'provider_stream_start': return '连接模型'
    case 'provider_first_event': return '模型开始响应'
    case 'provider_stream_done': return '模型响应完成'
    case 'running': return '处理中'
    // CHG-B-CP3 L3: raw system/* subtypes the CLI wire decoders (kit/llm/stream
    // claude.go + stream_codex.go) pass straight through as `status` when a
    // subtype isn't otherwise mapped. Without a dictionary entry these leaked
    // verbatim to the user — worst case a slow-reasoning model (e.g. redacted
    // extended thinking) sits on "thinking_tokens" for minutes looking dead.
    case 'thinking_tokens': return '深度推理中'
    case 'thinking': return '深度推理中'
    case 'init': return '初始化中'
    case 'started': return '启动中'
    case 'streaming': return '模型开始响应'
    case 'tool_call': return '准备调用工具'
    case 'rate_limit': return '触发限流，等待重试'
    default: return status
  }
}

export function removeWaitingBlocks(blocks: AssistantBlock[]): AssistantBlock[] {
  return blocks.filter(block => block.type !== 'waiting')
}

function ensureAssistantMessage(
  existing: AssistantMessage | null,
  options: AssistantWorkstreamApplyOptions,
): AssistantMessage {
  if (existing) return existing
  const msg: AssistantMessage = {
    id: `a-${options.now?.() ?? Date.now()}`,
    role: 'assistant',
    blocks: [],
    streaming: true,
    started_at_ms: options.streamingStartedAt,
  }
  // RETURN THE REACTIVE PROXY, NOT THE RAW OBJECT. options.messages is a Vue reactive
  // array (the controller's messages.value): pushing `msg` stores a reactive proxy of it,
  // and ALL later mutations the apply loop performs (msg.live_usage = …, msg.usage = …,
  // msg.elapsed_ms = …) must go THROUGH that proxy to fire the reactive set-trap. Returning
  // the raw `msg` let the apply loop write the freshly-ADDED keys (live_usage / usage)
  // straight onto the raw target — bypassing the proxy — so the UsageFooter `usage` computed
  // (which tracked `message.live_usage` while it was still undefined) was never invalidated.
  // The live multi-round footer then froze at its first render: TTFT / in/out / thinking
  // stuck on「—」for every round after the first (started_at_ms/blocks happened to look right
  // because their reads ride co-dependencies that DO retrigger). Reading the element back out
  // of the array yields the proxy, so the whole turn's metrics now land reactively.
  const index = options.messages.push(msg) - 1
  return options.messages[index] ?? msg
}

function updateWaitingStatus(message: AssistantMessage, status: string, startedAt: number): void {
  const blocks = [...(message.blocks ?? [])]
  const waitingIndex = blocks.findIndex(block => block.type === 'waiting')
  if (waitingIndex >= 0) {
    blocks[waitingIndex] = {
      type: 'waiting',
      status,
      startedAt: (blocks[waitingIndex] as Extract<AssistantBlock, { type: 'waiting' }>).startedAt,
    }
  } else if (!blocks.some(block => block.type === 'text')) {
    blocks.unshift({ type: 'waiting', status, startedAt })
  }
  message.blocks = blocks
}

function appendText(
  message: AssistantMessage,
  content: string,
  options: AssistantWorkstreamApplyOptions,
): void {
  if (!content) return
  const blocks = removeWaitingBlocks([...(message.blocks ?? [])])
  const last = blocks[blocks.length - 1]
  if (last?.type === 'text') {
    blocks[blocks.length - 1] = { type: 'text', content: last.content + content }
  } else {
    // Text begins → the model has moved past thinking; mark any live thinking block
    // done so the surface auto-collapses it (live thinking 展开 → 收起转场). UX: the
    // user watches thinking stream, then it folds as the answer starts. P3a: this is
    // also where thinking duration freezes (settleThinking stamps endedAt=now).
    settleThinking(blocks, options.now)
    blocks.push({ type: 'text', content })
  }
  message.blocks = blocks
  message.content = (message.content || '') + content
}

// settleThinking flips every still-streaming thinking block to done in place, so the
// ThinkingBlock surface collapses it (open follows block.streaming). Called when text
// starts and on done — the two honest "thinking finished" transitions.
// CHG-015 P3a: also FREEZE the duration by stamping endedAt = now at settle time. The
// displayed thinking time then equals endedAt-startedAt (same 口径 as backend total),
// stops ticking, and can never exceed the round's total (含等待空转 was the old bug).
function settleThinking(blocks: AssistantBlock[], now?: () => number): void {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    const tb = b as Extract<AssistantBlock, { type: 'thinking' }>
    if (b.type === 'thinking' && tb.streaming) {
      blocks[i] = { ...tb, streaming: false, endedAt: tb.endedAt ?? (now?.() ?? Date.now()) }
    }
  }
}

function appendThinking(
  message: AssistantMessage,
  content: string,
  options: AssistantWorkstreamApplyOptions,
): void {
  if (!content) return
  const blocks = removeWaitingBlocks([...(message.blocks ?? [])])
  const last = blocks[blocks.length - 1]
  if (last?.type === 'thinking') {
    blocks[blocks.length - 1] = { ...last, content: `${last.content}${content}`, streaming: true }
  } else {
    blocks.push({ type: 'thinking', content, startedAt: options.now?.() ?? Date.now(), streaming: true })
  }
  message.blocks = blocks
}

function appendBlock(message: AssistantMessage, block: AssistantBlock): void {
  message.blocks = [...removeWaitingBlocks(message.blocks ?? []), block]
}

// upsertTool merges one tool lifecycle event into the message BY TOOL ID. A single
// tool surfaces as SEVERAL same-id events — early start (name, args still
// streaming), completed start (full args), result (output) — which must converge on
// ONE tool-group entry instead of duplicating. Fields merge non-destructively
// (mergeToolEvent): an incoming undefined never clobbers a value already captured,
// so a result event (which carries no input) preserves the start's arguments. A tool
// id not yet present is appended to the current tool-group (created if none). One
// function for the whole tool lifecycle — tool_start AND tool_result both call it.
function upsertTool(message: AssistantMessage, tool?: AssistantToolEvent): void {
  if (!tool) return
  const blocks = removeWaitingBlocks([...(message.blocks ?? [])])
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]
    if (block.type !== 'tool-group') continue
    // The open AssistantExtensionBlock variant (CHG-013 D8) prevents TS from
    // narrowing `tools` off the discriminant alone; assert the concrete variant.
    const toolGroup = block as Extract<AssistantBlock, { type: 'tool-group' }>
    const toolIndex = toolGroup.tools.findIndex(item => item.id === tool.id)
    if (toolIndex < 0) continue
    const tools = [...toolGroup.tools]
    tools[toolIndex] = mergeToolEvent(tools[toolIndex], tool)
    blocks[i] = { type: 'tool-group', tools }
    message.blocks = blocks
    return
  }
  // First sighting of this tool id → append to the last tool-group (create if none).
  let groupIndex = blocks.findIndex(block => block.type === 'tool-group')
  if (groupIndex < 0) {
    blocks.push({ type: 'tool-group', tools: [] })
    groupIndex = blocks.length - 1
  }
  const group = blocks[groupIndex] as Extract<AssistantBlock, { type: 'tool-group' }>
  blocks[groupIndex] = { type: 'tool-group', tools: [...group.tools, tool] }
  message.blocks = blocks
}

// mergeToolEvent folds a later same-id event onto the earlier one. A nullish
// incoming field (e.g. the absent input on a result event) leaves the prior value
// intact — never erasing arguments captured at start.
function mergeToolEvent(prev: AssistantToolEvent, next: AssistantToolEvent): AssistantToolEvent {
  return {
    id: prev.id,
    name: next.name ?? prev.name,
    input: next.input ?? prev.input,
    output: next.output ?? prev.output,
    is_error: next.is_error ?? prev.is_error,
    duration_ms: next.duration_ms ?? prev.duration_ms,
    // P8: once done (a result event arrived), stay done — a stray late start must
    // never re-open a settled tool's spinner.
    done: next.done || prev.done || undefined,
  }
}

function replaceTaskPlan(message: AssistantMessage, tasks: AssistantTaskItem[]): void {
  const blocks = removeWaitingBlocks([...(message.blocks ?? [])])
  const index = blocks.findIndex(block => block.type === 'task-plan')
  if (index >= 0) {
    blocks[index] = { type: 'task-plan', tasks }
  } else {
    blocks.push({ type: 'task-plan', tasks })
  }
  message.blocks = blocks
}

function normalizeToolEvent(
  event: AssistantWorkstreamEvent,
  prefix: 'Tool' | 'Skill',
  options: AssistantWorkstreamApplyOptions,
  done: boolean,
): AssistantToolEvent | undefined {
  const raw = event.tool ?? event.skill
  const name = raw?.name || event.name || String(event.meta?.tool || prefix)
  if (!name) return undefined
  return {
    id: raw?.id || `${prefix.toLowerCase()}-${options.now?.() ?? Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    input: raw?.input ?? event.input,
    output: raw?.output ?? event.output,
    is_error: raw?.is_error ?? Boolean(event.error),
    duration_ms: raw?.duration_ms,
    // CHG-015 P8: result frames carry done=true. mergeToolEvent ORs it so a later
    // result settles a tool whose start had done=false (undefined ?? prev keeps it).
    done: done || undefined,
  }
}

// RawTurnMetrics is the canonical, source-agnostic per-turn metric record. It is
// the SSOT seam between the two assemblers: the LIVE path (usageFrom, below) and
// the REPLAY path (mapTranscript.toUsage in deepwork-pro) both flatten their own
// source into this shape and hand it to normalizeUsage — so the footer field set
// is DEFINED ONCE and can never drift between live and replay (the class of bug
// where a replayed turn silently dropped ttft/model while the live turn showed it).
export interface RawTurnMetrics {
  input_tokens?: number
  output_tokens?: number
  thinking_tokens?: number
  cache_read_tokens?: number
  ttft_ms?: number
  cost_usd?: number
  estimated?: boolean
  model?: string
}

// normalizeUsage is the ONE mapping from raw per-turn metrics → the footer VM
// (AssistantUsageInfo). Adding/removing a footer metric = editing this one place;
// both live and replay inherit it. Absent fields stay undefined → footer「—」
// (honest unknown, never fabricated).
export function normalizeUsage(m: RawTurnMetrics): AssistantUsageInfo {
  return {
    input_tokens: m.input_tokens,
    output_tokens: m.output_tokens,
    thinking_tokens: m.thinking_tokens,
    cache_read_tokens: m.cache_read_tokens,
    ttft_ms: m.ttft_ms,
    cost_usd: m.cost_usd,
    estimated: m.estimated,
    model: m.model,
  }
}

function usageFrom(event: AssistantWorkstreamEvent): AssistantUsageInfo {
  return normalizeUsage({
    input_tokens: numberFrom(event.done?.input_tokens ?? event.usage?.input_tokens),
    thinking_tokens: numberFrom(event.done?.thinking_tokens ?? event.usage?.thinking_tokens),
    output_tokens: numberFrom(event.done?.output_tokens ?? event.usage?.output_tokens),
    cost_usd: numberFrom(event.usage?.cost_usd ?? event.meta?.cost_usd),
    estimated: Boolean(event.usage?.estimated),
    // CHG-014 S8 F5: rmeta footer 读 ttft_ms/cache_read_tokens，此前流式路径不映射
    // → 永远显示「—」。从 done/usage/meta 三源回退填充。无源仍缺 → undefined → 渲染「—」。
    ttft_ms: numberFrom(event.done?.ttft_ms ?? event.usage?.ttft_ms ?? event.meta?.ttft_ms),
    cache_read_tokens: numberFrom(
      event.done?.cache_read_tokens ?? event.usage?.cache_read_tokens ?? event.meta?.cache_read_tokens,
    ),
    // 模型 id 骑在任一帧的 meta.model (owner processor / gateway) 或 done/usage 上。
    // 有则显真实模型；订阅版 runtime 从不上报 → undefined → footer 回落 runtime 意图或「—」。
    model: stringFrom(event.meta?.model ?? event.done?.model ?? event.usage?.model),
  })
}

// mergeUsage folds a later usage snapshot onto an earlier one WITHOUT letting an
// absent (undefined) incoming field erase a value already captured — so the Done
// frame (authoritative ttft/duration, but no per-round token/cache figures) enriches
// rather than blanks the figures accrued from the streaming `usage` events.
function mergeUsage(prev?: AssistantUsageInfo, next?: AssistantUsageInfo): AssistantUsageInfo | undefined {
  if (!prev) return next
  if (!next) return prev
  return {
    input_tokens: next.input_tokens ?? prev.input_tokens,
    thinking_tokens: next.thinking_tokens ?? prev.thinking_tokens,
    output_tokens: next.output_tokens ?? prev.output_tokens,
    cost_usd: next.cost_usd ?? prev.cost_usd,
    estimated: next.estimated || prev.estimated,
    ttft_ms: next.ttft_ms ?? prev.ttft_ms,
    cache_read_tokens: next.cache_read_tokens ?? prev.cache_read_tokens,
    // Model rides whichever round first reported it (a subscription round may omit
    // it); never let a later model-less usage frame blank an already-captured id.
    model: next.model ?? prev.model,
  }
}

function elapsedFrom(event: AssistantWorkstreamEvent, options: AssistantWorkstreamApplyOptions): number {
  return numberFrom(event.done?.elapsed_ms ?? event.meta?.duration_ms)
    ?? ((options.now?.() ?? Date.now()) - options.streamingStartedAt)
}

function numberFrom(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

// stringFrom coerces a meta value to a real model id, dropping the empty string and
// the "default" runtime-choose sentinel (never a price-matchable id) so the footer
// falls back to the session runtime / 「—」rather than showing "default".
function stringFrom(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const s = value.trim()
  return s === '' || s === 'default' ? undefined : s
}
