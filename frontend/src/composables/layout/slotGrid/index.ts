/**
 * SlotGrid 布局引擎 — 统一出口
 *
 * 实施优先级: P6+ (附录 E)，已实现核心数据结构 + composable + 渲染组件。
 */

// 类型
export type {
  SlotGrid,
  SlotNode,
  SlotLeaf,
  SlotBranch,
  SlotGridState,
  SlotConstraints,
  TabGroup,
  Tab,
  SerializedSlotGrid,
  SerializedNode,
  SerializedTab,
  DragPayload,
  DropTarget,
  SashProps,
} from './types'

export type { SlotRole } from './types'

// 核心 composable
export { useSlotGrid } from './useSlotGrid'
export type { SlotGridReturn } from './useSlotGrid'

// CSS 生成
export { buildGridCSS, buildBranchCSS, normalizeSizes, adjustSizes } from './buildGridCSS'

// 持久化 (服务端 KV 单一真相源)
export {
  saveSlotGridLayout,
  fetchServerLayout,
  resetSlotGridLayout,
} from './persistence'

// Pattern → Grid 转换 + 正交组合
export { patternToGrid, composeGrid, flattenLeaves } from './patternToGrid'
export type { GridModifiers } from './patternToGrid'

// 拖拽生命周期
export { useSlotDnd, calculateDropTarget, SLOT_DND_KEY } from './slotDnd'
export type { DndState, DropResult, SlotDndReturn } from './slotDnd'

// 键盘快捷键
export { useSlotGridKeys } from './useSlotGridKeys'
export type { SlotGridKeysOptions } from './useSlotGridKeys'

// 布局解析（合并用户覆盖 + 场景默认）
export { resolveLayout } from './resolveLayout'

// Portal 事件处理工厂
export { useSlotGridHandlers } from './useSlotGridHandlers'
export type { SlotGridHandlers, SlotGridHandlersOptions } from './useSlotGridHandlers'
