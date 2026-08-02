import { describe, expect, test } from 'bun:test'
import { thinkingPresentation } from '../thinkingPresentation'

describe('thinkingPresentation', () => {
  test('reports live and settled state without accepting raw reasoning', () => {
    expect(thinkingPresentation(true)).toEqual({
      label: '分析中',
      summary: '正在分析上下文与规划下一步',
      disclosure: '原始内部推理不展示，避免把模型草稿误作结论；工具调用、执行结果和最终回答仍完整可查。',
    })
    expect(thinkingPresentation(false).label).toBe('已分析')
  })
})
