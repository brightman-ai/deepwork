/**
 * useAgentStatus — Standardized channel-layer wrapper around useAgentIntel.
 *
 * useAgentIntel operates in terminal context (getter-based sessionId, WS
 * control messages). useAgentStatus adapts it to the channel composable
 * convention: Ref<string | null> sessionId, standardized AgentStatus[] shape.
 */
import { ref, computed, watch } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import { useAgentIntel } from '@ce/composables/cli/useAgentIntel'

export interface AgentStatus {
  id: string
  name: string
  state: 'idle' | 'running' | 'waiting' | 'error'
  model?: string
  tokens?: { input: number; output: number }
  updatedAt?: string
}

export interface UseAgentStatusReturn {
  agents: Ref<AgentStatus[]>
  overallHealth: ComputedRef<'healthy' | 'degraded' | 'down'>
  connected: Ref<boolean>
  /** Forward WS control messages from the terminal channel. */
  handleWSMessage: (payload: unknown) => void
}

/** Map backend AgentStatusType → channel AgentStatus.state */
function mapState(status: string): AgentStatus['state'] {
  switch (status) {
    case 'running': return 'running'
    case 'waiting': return 'waiting'
    case 'idle':
    case 'done':
    case 'none': return 'idle'
    default: return 'idle'
  }
}

export function useAgentStatus(sessionId: Ref<string | null>): UseAgentStatusReturn {
  // useAgentIntel expects a getter; bridge Ref → getter
  const intel = useAgentIntel(() => sessionId.value ?? '')

  const agents = computed<AgentStatus[]>(() => {
    const all = [
      intel.agentState.value,
      ...intel.notifications.value,
    ].filter(Boolean)

    return all.map((s, idx) => ({
      id: s!.tmuxWindow != null ? String(s!.tmuxWindow) : `agent-${idx}`,
      name: s!.model || 'agent',
      state: mapState(s!.status),
      model: s!.model || undefined,
      tokens: {
        input: s!.inputTokens,
        output: s!.outputTokens,
      },
      updatedAt: s!.updatedAt,
    }))
  })

  const overallHealth = computed<'healthy' | 'degraded' | 'down'>(() => {
    if (!intel.connected.value) return 'down'
    const hasError = agents.value.some(a => a.state === 'error')
    if (hasError) return 'degraded'
    return 'healthy'
  })

  // Expose a Ref<AgentStatus[]> (not ComputedRef) as specified in the contract
  const agentsRef = ref<AgentStatus[]>([]) as Ref<AgentStatus[]>
  watch(agents, val => { agentsRef.value = val }, { immediate: true })

  return {
    agents: agentsRef,
    overallHealth,
    connected: intel.connected,
    handleWSMessage: intel.handleWSMessage,
  }
}
