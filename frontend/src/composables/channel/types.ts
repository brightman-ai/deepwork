import type { ComputedRef } from 'vue'
import type { AssistantMessage, AssistantContextItem, AssistantLauncherItem } from '@ce/components/assistant-stream/types'

export interface SessionStrategy {
  ensureSession(): Promise<number | string>
  buildRequest(sessionId: number | string, text: string): { url: string; body: Record<string, unknown> }
  loadHistory(sessionId: number | string): Promise<AssistantMessage[]>
}

/** §14 MUST — Contract every StreamAdapter surface must satisfy. */
export interface StreamAdapterContract {
  portalId: string
  sessionStrategy: SessionStrategy
  contextItems?: ComputedRef<AssistantContextItem[]>
  launcherItems?: ComputedRef<AssistantLauncherItem[]>
  emptyState?: { title: string; hint: string }
  composer?: {
    placeholder?: ComputedRef<string>
    buildInput?: (text: string) => string | Promise<string>
  }
  onSideEffect?: (kind: string, event: unknown) => void
}
