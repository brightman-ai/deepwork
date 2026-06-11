// RunStream density spectrum (CHG-013 D8): full ⊃ chat ⊃ compact — a single
// semantic source for the one AssistantStreamSurface base; density only controls
// visibility/sizing, never forks block rendering.
//   full    = WS / OD / CLI 全量主流
//   chat    = chat portal solo (单栏对话)
//   compact = 伴随边栏 (Browser / Topic companion)
export type AssistantDensity = 'full' | 'chat' | 'compact'

export type AssistantRole = 'user' | 'assistant' | 'system'

export interface AssistantRuntimeInfo {
  agent?: string
  model?: string
  effort?: string
}

export interface AssistantUsageInfo {
  input_tokens?: number
  thinking_tokens?: number
  output_tokens?: number
  cost_usd?: number
  estimated?: boolean
}

export interface AssistantToolEvent {
  id: string
  name: string
  input?: unknown
  output?: string
  is_error?: boolean
  duration_ms?: number
}

export interface AssistantTaskItem {
  id?: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

// Extension block (CHG-013 D8): portals register domain-specific blocks via
// blockRegistry.registerExtension(kind, component). The surface renders them
// through the registry by passing the whole block as the `block` prop. This is
// the ONLY sanctioned way to add portal blocks — the base must never branch on
// `if (portal === 'od')`.
export interface AssistantExtensionBlock {
  type: string
  [key: string]: unknown
}

export type AssistantBlock =
  | { type: 'text'; content: string }
  | { type: 'waiting'; status: string; startedAt?: number }
  | { type: 'thinking'; content: string; startedAt?: number; streaming?: boolean; runtime?: AssistantRuntimeInfo; usage?: AssistantUsageInfo }
  | { type: 'tool-group'; tools: AssistantToolEvent[] }
  | { type: 'task-plan'; tasks: AssistantTaskItem[] }
  | { type: 'permission'; content: string; effectClass?: string }
  | { type: 'error'; message: string; retryable?: boolean }
  | AssistantExtensionBlock

export interface AssistantMessage {
  id: string
  role: AssistantRole
  content?: string
  blocks?: AssistantBlock[]
  streaming?: boolean
  runtime?: AssistantRuntimeInfo
  usage?: AssistantUsageInfo
  live_usage?: AssistantUsageInfo
  elapsed_ms?: number
  started_at_ms?: number
  status?: 'normal' | 'failed'
  error?: string
}

export interface AssistantLauncherItem {
  id: string
  label: string
  description?: string
  insertText: string
}

export interface AssistantContextItem {
  label: string
  value: string
  tone?: 'default' | 'muted' | 'warning' | 'good'
}

export interface AssistantStatusItem {
  label: string
  value: string | number
}

export interface AssistantSessionCreatedEvent {
  sessionId: number
}
