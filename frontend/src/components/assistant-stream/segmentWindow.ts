// Giant AgentRuns are still one domain object, but they are not one DOM transaction.
// The window is a presentation projection only: the source segment array stays intact.
export const PROCESS_TRACE_PAGE_SIZE = 100
export const PROCESS_TRACE_PAGING_THRESHOLD = 120

export interface ProcessTraceSegmentWindow {
  start: number
  end: number
  total: number
}

export function latestSegmentWindowStart(
  total: number,
  pageSize = PROCESS_TRACE_PAGE_SIZE,
): number {
  return Math.max(0, total - pageSize)
}

export function segmentWindow(
  total: number,
  requestedStart: number,
  pageSize = PROCESS_TRACE_PAGE_SIZE,
): ProcessTraceSegmentWindow {
  const safeTotal = Math.max(0, total)
  if (safeTotal <= PROCESS_TRACE_PAGING_THRESHOLD) {
    return { start: 0, end: safeTotal, total: safeTotal }
  }
  const latestStart = latestSegmentWindowStart(safeTotal, pageSize)
  const start = Math.max(0, Math.min(Math.trunc(requestedStart), latestStart))
  return { start, end: Math.min(safeTotal, start + pageSize), total: safeTotal }
}

export function earlierSegmentWindowStart(
  currentStart: number,
  pageSize = PROCESS_TRACE_PAGE_SIZE,
): number {
  return Math.max(0, currentStart - pageSize)
}

export function newerSegmentWindowStart(
  total: number,
  currentStart: number,
  pageSize = PROCESS_TRACE_PAGE_SIZE,
): number {
  return Math.min(latestSegmentWindowStart(total, pageSize), currentStart + pageSize)
}

