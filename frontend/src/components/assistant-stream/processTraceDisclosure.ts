/**
 * Process-trace disclosure is a user-intent state machine, not a streaming side
 * effect. A live run stays compact by default: its pulse, elapsed time and summary
 * provide progress without dumping raw reasoning into the conversation. Attention
 * always pierces disclosure so an approval/error cannot be hidden.
 */
export type ProcessTraceIntent = 'auto' | 'manual-open' | 'manual-collapsed'

export function isProcessTraceOpen(
  intent: ProcessTraceIntent,
  attention: boolean,
): boolean {
  if (attention) return true
  return intent === 'manual-open'
}
