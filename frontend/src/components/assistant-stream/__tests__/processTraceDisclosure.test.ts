import { describe, expect, test } from 'bun:test'
import { isProcessTraceOpen } from '../processTraceDisclosure'

describe('process trace disclosure', () => {
  test('auto stays compact while progress is represented by the trace header', () => {
    expect(isProcessTraceOpen('auto', false)).toBe(false)
  })

  test('explicit user intent is stable', () => {
    expect(isProcessTraceOpen('manual-open', false)).toBe(true)
    expect(isProcessTraceOpen('manual-collapsed', false)).toBe(false)
  })

  test('attention cannot be hidden by any disclosure intent', () => {
    expect(isProcessTraceOpen('auto', true)).toBe(true)
    expect(isProcessTraceOpen('manual-collapsed', true)).toBe(true)
  })
})
