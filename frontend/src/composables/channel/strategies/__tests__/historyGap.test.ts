import { describe, expect, test } from 'bun:test'
import { historyGapMessage } from '../historyGap'

describe('historyGapMessage', () => {
  test('makes a canceled turn explicit instead of leaving a blank timeline', () => {
    expect(historyGapMessage({ status: 'canceled', canceled: true, hasVisibleOutput: false }))
      .toBe('本轮已取消，未生成可恢复的回答。')
  })

  test('surfaces terminal persistence gaps', () => {
    expect(historyGapMessage({ status: 'success', canceled: false, hasVisibleOutput: false }))
      .toBe('本轮没有可恢复的助手输出。')
    expect(historyGapMessage({ status: 'failed', canceled: false, hasVisibleOutput: false }))
      .toBe('本轮执行失败，但没有保存可显示的错误详情。')
  })

  test('does not invent a gap for visible output or non-terminal turns', () => {
    expect(historyGapMessage({ status: 'success', canceled: false, hasVisibleOutput: true })).toBeNull()
    expect(historyGapMessage({ status: 'running', canceled: false, hasVisibleOutput: false })).toBeNull()
  })
})
