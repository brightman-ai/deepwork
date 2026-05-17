/**
 * resolveLayout — 场景 slots 声明 → SlotGrid 树
 *
 * 三步管线:
 *   1. slots → 水平 ID 列表 (过滤 bottom/companion)
 *   2. patternToGrid (水平结构)
 *   3. composeGrid (正交修饰: bottom 包裹 + companion 嵌套)
 *
 * 单一入口，单一数据源。调用方只传 slots.value，无需预处理。
 *
 * SSOT: 服务端 KV Store (非 localStorage)
 * 此函数不读取任何持久化数据 — 避免 stale cache 导致双 SSOT。
 */

import type { SlotGrid } from './types'
import type { LayoutPattern, SlotConfig } from '../types'
import type { GridModifiers } from './patternToGrid'
import { patternToGrid, composeGrid } from './patternToGrid'

/** bottom/companion 不参与水平 pattern，在排序前过滤 */
const ORTHOGONAL_SLOTS = new Set(['bottom', 'companion'])

/**
 * 各 pattern 的叶子节点位置规范顺序。
 * slotIds 按此排列后再映射到叶子位置，确保 pattern 结构稳定。
 */
const PATTERN_SLOT_ORDER: Record<string, string[]> = {
  'solo':         ['primary'],
  'sidebar-main': ['navigator', 'primary', 'secondary'],
  'main-sidebar': ['primary', 'secondary', 'navigator'],
  'triple':       ['navigator', 'primary', 'secondary'],
}

function orderSlotIds(pattern: LayoutPattern | string, ids: string[]): string[] {
  const order = PATTERN_SLOT_ORDER[pattern]
  if (!order) return ids
  return ids.slice().sort((a, b) => {
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib)
  })
}

/**
 * 生成场景默认布局。
 *
 * @param portalId - Portal 唯一标识
 * @param scenario - 当前场景名
 * @param pattern  - 场景声明的 LayoutPattern
 * @param platform - 运行平台
 * @param slots    - 场景声明的全部 slot 配置 (单一数据源)
 */
export function resolveLayout(
  _portalId: string,
  _scenario: string,
  pattern: LayoutPattern,
  _platform: 'wails-macos' | 'wails-windows' | 'browser',
  slots: Record<string, SlotConfig | null>,
): SlotGrid {
  const allIds = Object.keys(slots).filter(k => slots[k] !== null)

  // 1. 水平 ID: 过滤正交 slot，按 pattern 顺序排列
  const horizontalIds = allIds.filter(id => !ORTHOGONAL_SLOTS.has(id))
  const orderedIds = horizontalIds.length > 0
    ? orderSlotIds(pattern, horizontalIds)
    : undefined

  // 2. 基础水平 grid
  const baseGrid = patternToGrid(pattern, 3, orderedIds)

  // 3. 正交修饰
  const hasBottom = allIds.includes('bottom')
  const hasCompanion = allIds.includes('companion')
  if (!hasBottom && !hasCompanion) return baseGrid

  const modifiers: GridModifiers = {}

  if (hasCompanion) {
    const cfg = slots['companion']!
    modifiers.companion = {
      attachTo: allIds.includes('secondary') ? 'secondary' : 'primary',
      initialCollapsed: cfg.initialState === 'collapsed',
    }
  }

  if (hasBottom) {
    const cfg = slots['bottom']!
    modifiers.bottom = {
      initialCollapsed: cfg.initialState === 'collapsed',
    }
  }

  return composeGrid(baseGrid, modifiers)
}
