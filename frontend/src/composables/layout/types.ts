/**
 * Shared type definitions for the Pane layout system.
 * Import from here for tree-shaking friendliness.
 */

export type LayoutPattern = 'solo' | 'sidebar-main' | 'main-sidebar' | 'triple' | 'split-n'

export type Breakpoint = 'mobile' | 'tablet' | 'desktop'

export type Platform = 'wails-macos' | 'wails-windows' | 'browser'

export type SlotRole = 'primary' | 'secondary' | 'navigator' | 'companion' | 'bottom'

export interface SlotConfig {
  pane: string
  primitive?: string // StreamPane / CanvasPane / PanelPane / FormPane / WorkArea
  display?: string   // list / tree / grid / table (for PanelPane)
  mode?: string      // full / compact / mini (for StreamPane)
  lifecycle?: 'persistent' | 'on-demand-popover' | 'overlay-sheet'
  initialState?: 'expanded' | 'collapsed'
  compact?: boolean
}

export interface ScenarioState {
  layout: LayoutPattern
  slots: Record<string, SlotConfig>
  on: Record<string, string> // event → target state name
  /** 当前场景是否显示顶部 RunContextBar（默认不显示） */
  showHeader?: boolean
}

/** 场景转换守卫 — 阻止无效转换并提供生命周期钩子 */
export interface ScenarioGuard {
  /** 返回 false 阻止本次转换 */
  canTransition?: (from: string, to: string) => boolean
  /** 离开当前场景前调用（清理） */
  beforeLeave?: (from: string) => void | Promise<void>
  /** 进入新场景后调用（初始化） */
  afterEnter?: (to: string) => void | Promise<void>
}

export interface ScenarioMachineConfig {
  initial: string
  states: Record<string, ScenarioState>
  /** 以事件名为 key 的守卫映射；未注册的事件正常通行 */
  guards?: Record<string, ScenarioGuard>
}

export interface PanePreference {
  portal: string
  scenario: string
  slot: string
  device: Breakpoint
  manuallyClosed: boolean
  lastClosedAt?: number
  pinned?: boolean
  width?: number
}

export interface LayoutEffect {
  slot: string
  action: 'expand' | 'collapse' | 'badge' | 'show-tab'
  tabId?: string
  badgeCount?: number
}

export interface LayoutPolicyContext {
  userManuallyClosed: (slot: string) => boolean
  expandSlot: (slot: string, tabId?: string) => void
  collapseSlot: (slot: string) => void
  updateBadge: (slot: string, count: number) => void
}
