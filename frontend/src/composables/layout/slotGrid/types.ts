/**
 * SlotGrid 布局引擎核心数据结构
 *
 * 实施优先级: P6+ (附录 E)
 * 当前 Phase 1-3 使用 CSS Grid + v8.1 Pattern，本模块为终局形态数据结构定义。
 * 最大深度 3 层，避免任意嵌套复杂度 (参考 VS Code Grid<T>)。
 */

import type { SlotRole } from '../types'

export type { SlotRole }

// ─── 核心节点类型 ───────────────────────────────────────────────────────────

export interface SlotGrid {
  orientation: 'horizontal' | 'vertical'
  children: SlotNode[]
  sizes: number[] // 每个 child 的比例 (0-1, 总和 = 1)
}

export type SlotNode = SlotLeaf | SlotBranch

export interface SlotLeaf {
  type: 'leaf'
  id: string // 唯一 slot ID
  role: SlotRole
  constraints: SlotConstraints
  collapsed: boolean
  tabGroup: TabGroup
}

export interface SlotBranch {
  type: 'branch'
  orientation: 'horizontal' | 'vertical'
  children: SlotNode[] // 递归, 深度限制为 3
  sizes: number[] // 各 child 比例, 总和 = 1
}

// ─── 约束 ────────────────────────────────────────────────────────────────────

export interface SlotConstraints {
  minWidth: number // px, 默认 200
  maxWidth?: number // px, 可选
  minHeight: number // px, 默认 100
  collapsible: boolean // 可折叠为 0 宽度
  resizable: boolean // 可拖拽 resize
  closable: boolean // 可关闭
}

// ─── Tab 系统 ────────────────────────────────────────────────────────────────

export interface TabGroup {
  tabs: Tab[]
  activeTabId: string | null
  tabBarVisible: boolean // 单 tab 时可隐藏 tab bar
  overflow: 'scroll' | 'dropdown' // tab 过多时的处理
}

export interface Tab {
  id: string
  label: string
  icon?: unknown // Component 引用，避免循环依赖
  adapterId: string // 组件注册 ID
  adapterProps: Record<string, unknown>
  closable: boolean
  pinned: boolean // pinned tab 不可关闭不可拖拽
  dirty: boolean // 有未保存内容
  tooltip?: string
}

// ─── 全局状态 ─────────────────────────────────────────────────────────────────

export interface SlotGridState {
  grid: SlotGrid
  activeSlotId: string | null
  collapsedSlots: Set<string>
}

// ─── 序列化 ───────────────────────────────────────────────────────────────────

export interface SerializedSlotGrid {
  version: 1
  portal: string
  scenario: string
  platform: string
  timestamp: number
  grid: SerializedNode
}

export type SerializedNode =
  | {
      type: 'leaf'
      id: string
      role: string
      collapsed: boolean
      tabs: SerializedTab[]
      activeTab: string | null
      sizes?: never
      orientation?: never
      children?: never
    }
  | {
      type: 'branch'
      orientation: string
      children: SerializedNode[]
      sizes: number[]
      id?: never
      role?: never
      collapsed?: never
      tabs?: never
      activeTab?: never
    }

export interface SerializedTab {
  id: string
  label: string
  adapterId: string
  adapterProps: Record<string, unknown>
  pinned: boolean
}

// ─── 拖拽 ─────────────────────────────────────────────────────────────────────

export type DragPayload =
  | { type: 'tab'; sourceLeafId: string; tabId: string }
  | { type: 'leaf'; sourceLeafId: string }

export interface DropTarget {
  leafId: string
  position: 'center' | 'left' | 'right' | 'top' | 'bottom'
}

// ─── Sash Props ────────────────────────────────────────────────────────────────

export interface SashProps {
  orientation: 'vertical' | 'horizontal'
  index: number // 在 children 数组中的位置
  parentPath: number[] // 到达父节点的路径
  minBefore: number // 左/上侧最小像素
  minAfter: number // 右/下侧最小像素
}
