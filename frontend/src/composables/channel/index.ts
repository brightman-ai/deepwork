/**
 * Channel composables — public barrel export.
 *
 * Consumers import from '@ce/composables/channel' to access all channel-layer
 * primitives without reaching into individual files.
 */

export { useAgentStatus } from './useAgentStatus'
export type { AgentStatus, UseAgentStatusReturn } from './useAgentStatus'

export { useEventChannel } from './useEventChannel'
export { useTerminalChannel } from './useTerminalChannel'
export { useWorkstreamController } from './useWorkstreamController'

export type { SessionStrategy, StreamAdapterContract } from './types'
