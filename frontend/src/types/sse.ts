/**
 * SSE Event Type Definitions (ADR-045 §2.2)
 * Frontend TypeScript representation of backend SSE events contract.
 */

// PathType: "fast" for single LLM call, "slow" for multi-step workflow
export type PathType = 'fast' | 'slow'

// ① connected — Connection established
export interface SSEConnectedPayload {
  session_id: string
  timestamp: number
  path: PathType // "fast" | "slow"
}

// ② reasoning — CoT reasoning tokens (both FastPath and SlowPath)
export interface SSEReasoningPayload {
  content: string // Reasoning token chunk
  seq: number     // Sequence number
}

// ③ tool_start — Tool call initiated
export interface SSEToolStartPayload {
  call_id: string
  tool: string
  arguments?: Record<string, any> // Tool arguments
  internal?: boolean // ADR-045: true = skill internal call, not shown in UI
}

// ④ tool_result — Tool call result
export interface SSEToolResultPayload {
  call_id: string
  tool: string
  result: string
  status: string       // "success" | "error"
  duration_ms: number
}

// ⑤ content — Response content tokens
export interface SSEContentPayload {
  delta: string  // Content chunk
  seq: number    // Sequence number
}

// ⑥ workflow_start — SlowPath workflow start
export interface SSEWorkflowStartPayload {
  workflow_id: string
  workflow_name: string
  total_steps: number
  steps: Array<{
    index: number
    name: string
  }>
}

// ⑦ step_start — SlowPath step start
export interface SSEStepStartPayload {
  step_index: number
  step_name: string
  step_total: number
}

// ⑧ step_end — SlowPath step end
export interface SSEStepEndPayload {
  step_index: number
  step_name: string
  duration_ms: number
  tokens: number
}

// ⑨ done — Final completion event
export interface SSEDonePayload {
  success: boolean
  duration_ms: number
  metadata?: DoneMetadata
}

// DoneMetadata — Completion metadata
export interface DoneMetadata {
  model: string
  provider: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  tokens_per_second: number
  ttft_ms: number         // Time to first token
  finish_reason: string
  // SlowPath additional fields (optional)
  steps_completed?: number
  step_details?: Array<{
    name: string
    duration_ms: number
    tokens: number
  }>
}

// ⑩ error — Error event
export interface SSEErrorPayload {
  error: string
  code?: string
  recoverable: boolean // true if user can retry
}

// ⑪ ping — Heartbeat event
export interface SSEPingPayload {
  timestamp: number
}

// ─── BS-03 DESIGN v3.0 §5.2: New SSE Event Types ────────────

// ⑫ turn_start — Turn begins (BS-03 §5.2)
export interface SSETurnStartPayload {
  session_id: number
  turn_id: number
  routing: 'fast_path' | 'slow_path' | 'skill_exec'
}

// ⑬ turn_complete — Turn finished (BS-03 §5.2)
export interface SSETurnCompletePayload {
  session_id: number
  turn_id: number
  duration_ms: number
}

// ⑭ session_state_sync — Session full-state recovery (BS-03 §5.3, KISS model)
export interface SSESessionStatePayload {
  session_id: number
  turn_count: number
  snapshot_dirty: boolean
  ended_at: string | null
  recent_turns: Array<{
    id: number
    turn_number: number
    role: string
    content: string
    status: 'pending' | 'success' | 'failed'
  }>
}

// ⑮ stage_progress — ThinkFlow stage progress (BS-03 §5.2 / BS-04)
export interface SSEStageProgressPayload {
  stage_name: string
  stage_state: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
}

// ⑯ post_created — New post notification (BS-02 §5.6)
export interface SSEPostCreatedPayload {
  topic_id: number
  post_id: number
  post_number: number
  post_kind: 'human_raw' | 'ai_snapshot' | 'ai_reply' | 'activity'
  author_kind: 'user' | 'workforce' | 'system'
}

/**
 * SSE Event Union Type
 * Discriminated union for type-safe event handling
 */
export type SSEEvent =
  | { type: 'connected'; data: SSEConnectedPayload }
  | { type: 'reasoning'; data: SSEReasoningPayload }
  | { type: 'tool_start'; data: SSEToolStartPayload }
  | { type: 'tool_result'; data: SSEToolResultPayload }
  | { type: 'content'; data: SSEContentPayload }
  | { type: 'workflow_start'; data: SSEWorkflowStartPayload }
  | { type: 'step_start'; data: SSEStepStartPayload }
  | { type: 'step_end'; data: SSEStepEndPayload }
  | { type: 'done'; data: SSEDonePayload }
  | { type: 'error'; data: SSEErrorPayload }
  | { type: 'ping'; data: SSEPingPayload }
  // BS-03 DESIGN v3.0 new events
  | { type: 'turn_start'; data: SSETurnStartPayload }
  | { type: 'turn_complete'; data: SSETurnCompletePayload }
  | { type: 'session_state_sync'; data: SSESessionStatePayload }
  | { type: 'stage_progress'; data: SSEStageProgressPayload }
  | { type: 'post_created'; data: SSEPostCreatedPayload }

/**
 * SSE Event Type Guards
 * Helper functions for type narrowing
 */
export function isConnected(event: SSEEvent): event is { type: 'connected'; data: SSEConnectedPayload } {
  return event.type === 'connected'
}

export function isReasoning(event: SSEEvent): event is { type: 'reasoning'; data: SSEReasoningPayload } {
  return event.type === 'reasoning'
}

export function isToolStart(event: SSEEvent): event is { type: 'tool_start'; data: SSEToolStartPayload } {
  return event.type === 'tool_start'
}

export function isToolResult(event: SSEEvent): event is { type: 'tool_result'; data: SSEToolResultPayload } {
  return event.type === 'tool_result'
}

export function isContent(event: SSEEvent): event is { type: 'content'; data: SSEContentPayload } {
  return event.type === 'content'
}

export function isWorkflowStart(event: SSEEvent): event is { type: 'workflow_start'; data: SSEWorkflowStartPayload } {
  return event.type === 'workflow_start'
}

export function isStepStart(event: SSEEvent): event is { type: 'step_start'; data: SSEStepStartPayload } {
  return event.type === 'step_start'
}

export function isStepEnd(event: SSEEvent): event is { type: 'step_end'; data: SSEStepEndPayload } {
  return event.type === 'step_end'
}

export function isDone(event: SSEEvent): event is { type: 'done'; data: SSEDonePayload } {
  return event.type === 'done'
}

export function isError(event: SSEEvent): event is { type: 'error'; data: SSEErrorPayload } {
  return event.type === 'error'
}

export function isPing(event: SSEEvent): event is { type: 'ping'; data: SSEPingPayload } {
  return event.type === 'ping'
}

// BS-03 DESIGN v3.0 new event type guards

export function isTurnStart(event: SSEEvent): event is { type: 'turn_start'; data: SSETurnStartPayload } {
  return event.type === 'turn_start'
}

export function isTurnComplete(event: SSEEvent): event is { type: 'turn_complete'; data: SSETurnCompletePayload } {
  return event.type === 'turn_complete'
}

export function isSessionStateSync(event: SSEEvent): event is { type: 'session_state_sync'; data: SSESessionStatePayload } {
  return event.type === 'session_state_sync'
}

export function isStageProgress(event: SSEEvent): event is { type: 'stage_progress'; data: SSEStageProgressPayload } {
  return event.type === 'stage_progress'
}

export function isPostCreated(event: SSEEvent): event is { type: 'post_created'; data: SSEPostCreatedPayload } {
  return event.type === 'post_created'
}
