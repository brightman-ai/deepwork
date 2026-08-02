// Thinking blocks carry transport data used for timing and transcript continuity,
// but raw chain-of-thought is neither a product answer nor an auditable action log.
// This projection is the single UI policy: show honest progress and metadata while
// keeping model scratch-work out of the rendered DOM.
export interface ThinkingPresentation {
  label: string
  summary: string
  disclosure: string
}

export function thinkingPresentation(streaming: boolean): ThinkingPresentation {
  return {
    label: streaming ? '分析中' : '已分析',
    summary: streaming ? '正在分析上下文与规划下一步' : '分析过程已完成',
    disclosure:
      '原始内部推理不展示，避免把模型草稿误作结论；工具调用、执行结果和最终回答仍完整可查。',
  }
}
