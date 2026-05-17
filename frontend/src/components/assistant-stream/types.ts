export type AssistantDensity = 'regular' | 'compact'

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

export type AssistantBlock =
  | { type: 'text'; content: string }
  | { type: 'waiting'; status: string; startedAt?: number }
  | { type: 'thinking'; content: string; startedAt?: number; streaming?: boolean; runtime?: AssistantRuntimeInfo; usage?: AssistantUsageInfo }
  | { type: 'tool-group'; tools: AssistantToolEvent[] }
  | { type: 'task-plan'; tasks: AssistantTaskItem[] }
  | { type: 'permission'; content: string; effectClass?: string }
  | { type: 'error'; message: string; retryable?: boolean }

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
