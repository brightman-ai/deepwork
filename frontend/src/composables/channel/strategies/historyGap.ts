export interface HistoryGapInput {
  status?: string
  canceled: boolean
  hasVisibleOutput: boolean
}

/**
 * Terminal history can legitimately have no recoverable assistant payload
 * (canceled turns, old persistence gaps, failed runs without an error body).
 * Returning null for an in-flight/unknown state avoids inventing a terminal result;
 * returning a message for terminal states prevents a silent blank timeline.
 */
export function historyGapMessage(input: HistoryGapInput): string | null {
  if (input.hasVisibleOutput) return null
  if (input.canceled) return '本轮已取消，未生成可恢复的回答。'

  const status = (input.status ?? '').trim().toLowerCase()
  if (status === 'failed' || status === 'error') {
    return '本轮执行失败，但没有保存可显示的错误详情。'
  }
  if (status === 'success' || status === 'completed' || status === 'done') {
    return '本轮没有可恢复的助手输出。'
  }
  return null
}
