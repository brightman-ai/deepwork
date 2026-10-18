import type { SessionMetricsBag, Turn, TurnsSummary } from '@ce/types/sessionMetrics'

export const MODEL_TPS_PLAUSIBLE_MAX = 600

export function sumSessionMetric(summary: TurnsSummary | null | undefined, turns: readonly Turn[], key: keyof Turn & string): number | null {
  if (summary) {
    const value = summary[key as keyof TurnsSummary]
    return typeof value === 'number' ? value : null
  }
  let total = 0
  let seen = false
  for (const turn of turns) {
    const value = turn[key as keyof Turn]
    if (typeof value === 'number') { total += value; seen = true }
  }
  return seen ? total : null
}

/** Output-stage TPS: output tokens / (duration − TTFT), excluding turns with missing evidence. */
export function outputStageTps(turns: readonly Turn[]): number | null {
  let generationMs = 0
  let outputTokens = 0
  for (const turn of turns) {
    if (typeof turn.duration_ms !== 'number' || typeof turn.ttft_ms !== 'number' || typeof turn.output_tokens !== 'number') continue
    if (turn.output_tokens <= 0 || turn.duration_ms <= turn.ttft_ms) continue
    generationMs += turn.duration_ms - turn.ttft_ms
    outputTokens += turn.output_tokens
  }
  return generationMs > 0 && outputTokens > 0 ? outputTokens / (generationMs / 1000) : null
}

/** Model TPS: pure output window speed, with the same plausibility guard everywhere. */
export function modelTps(summary: TurnsSummary | null | undefined, turns: readonly Turn[]): number | null {
  let windowMs = summary?.output_window_ms ?? null
  let outputTokens = summary?.output_tokens ?? null
  if (windowMs == null || outputTokens == null) {
    windowMs = 0; outputTokens = 0
    for (const turn of turns) {
      if (typeof turn.output_window_ms === 'number' && typeof turn.output_tokens === 'number' && turn.output_window_ms > 0 && turn.output_tokens > 0) {
        windowMs += turn.output_window_ms; outputTokens += turn.output_tokens
      }
    }
  }
  if (windowMs <= 0 || outputTokens <= 0) return null
  const value = outputTokens / (windowMs / 1000)
  return value > 0 && value <= MODEL_TPS_PLAUSIBLE_MAX ? value : null
}

export function sessionTokenAndSpeedMetrics(bag: SessionMetricsBag): {
  inputTokens: number | null
  outputTokens: number | null
  outputTps: number | null
  modelTps: number | null
} {
  const turns = bag.turns ?? []
  return {
    inputTokens: sumSessionMetric(bag.summary, turns, 'input_tokens'),
    outputTokens: sumSessionMetric(bag.summary, turns, 'output_tokens'),
    outputTps: outputStageTps(turns),
    modelTps: modelTps(bag.summary, turns),
  }
}
