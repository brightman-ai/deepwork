// CHG-014 D2: assistant-stream 模块统一出口。
// 既有深路径导入 (@ce/components/assistant-stream/types 等) 保持不变；本 barrel 是补充。
export { default as AssistantStreamSurface } from './AssistantStreamSurface.vue'
export { default as SessionStreamController } from './SessionStreamController.vue'
export { blockRegistry } from './blockRegistry'

export * from './types'
export * from './blocks'
export * from './primitives'
