/**
 * Channel composables — public barrel export.
 *
 * Consumers import from '@ce/composables/channel' to access generic channel
 * primitives. Terminal-specific composables (useTerminalChannel, useAgentStatus)
 * live in deepwork-terminal and deepwork-pro respectively — they depend on
 * terminal-only internals (useWebSocketClient, useAgentIntel) that must not
 * leak into the framework layer.
 */

export { useEventChannel } from './useEventChannel'
export { useWorkstreamController } from './useWorkstreamController'

export type { SessionStrategy, StreamAdapterContract } from './types'
