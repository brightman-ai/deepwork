import type {
  AssistantBlock,
  AssistantMessage,
  AssistantTaskItem,
  AssistantToolEvent,
  AssistantUsageInfo,
} from './types'

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

export function applyAssistantWorkstreamEvent(
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
      appendText(msg, event.content || '')
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
      appendTool(msg, normalizeToolEvent(event, event.kind === 'skill_start' ? 'Skill' : 'Tool', options))
      return msg
    }
    case 'tool_result':
    case 'skill_result': {
      const msg = ensureAssistantMessage(current, options)
      updateToolResult(msg, normalizeToolEvent(event, event.kind === 'skill_result' ? 'Skill' : 'Tool', options))
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
        current.blocks = removeWaitingBlocks(current.blocks ?? [])
        current.usage = usageFrom(event)
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
    case 'loading_context': return '读取上下文'
    case 'context_done': return '上下文就绪'
    case 'calling_model':
    case 'llm_calling': return '调用模型'
    case 'provider_stream_start': return '连接模型'
    case 'provider_first_event': return '模型开始响应'
    case 'provider_stream_done': return '模型响应完成'
    case 'running': return '处理中'
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
  options.messages.push(msg)
  return msg
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

function appendText(message: AssistantMessage, content: string): void {
  if (!content) return
  const blocks = removeWaitingBlocks([...(message.blocks ?? [])])
  const last = blocks[blocks.length - 1]
  if (last?.type === 'text') {
    blocks[blocks.length - 1] = { type: 'text', content: last.content + content }
  } else {
    blocks.push({ type: 'text', content })
  }
  message.blocks = blocks
  message.content = (message.content || '') + content
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

function appendTool(message: AssistantMessage, tool?: AssistantToolEvent): void {
  if (!tool) return
  const blocks = removeWaitingBlocks([...(message.blocks ?? [])])
  let groupIndex = blocks.findIndex(block => block.type === 'tool-group')
  if (groupIndex < 0) {
    blocks.push({ type: 'tool-group', tools: [] })
    groupIndex = blocks.length - 1
  }
  const group = blocks[groupIndex] as Extract<AssistantBlock, { type: 'tool-group' }>
  blocks[groupIndex] = {
    type: 'tool-group',
    tools: [...group.tools, tool],
  }
  message.blocks = blocks
}

function updateToolResult(message: AssistantMessage, tool?: AssistantToolEvent): void {
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
    tools[toolIndex] = { ...tools[toolIndex], ...tool }
    blocks[i] = { type: 'tool-group', tools }
    message.blocks = blocks
    return
  }
  message.blocks = blocks
  appendTool(message, tool)
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
  }
}

function usageFrom(event: AssistantWorkstreamEvent): AssistantUsageInfo {
  return {
    input_tokens: numberFrom(event.done?.input_tokens ?? event.usage?.input_tokens),
    thinking_tokens: numberFrom(event.done?.thinking_tokens ?? event.usage?.thinking_tokens),
    output_tokens: numberFrom(event.done?.output_tokens ?? event.usage?.output_tokens),
    cost_usd: numberFrom(event.usage?.cost_usd ?? event.meta?.cost_usd),
    estimated: Boolean(event.usage?.estimated),
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
