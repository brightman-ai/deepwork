/**
 * v8.1 Pattern → SlotGrid 转换助手
 *
 * 将现有 v8.1 固定 Pattern 转换为 SlotGrid 树，让存量 Portal 可以渐进迁移。
 * Pattern 映射来自 DPF-FINAL-SPEC 附录 E §E.4。
 */

import type { SlotGrid, SlotLeaf, SlotBranch, SlotRole, SlotConstraints, TabGroup } from './types'
import type { LayoutPattern } from '../types'

// ─── 工厂函数 ─────────────────────────────────────────────────────────────────

function defaultConstraints(overrides?: Partial<SlotConstraints>): SlotConstraints {
  return {
    minWidth: 200,
    minHeight: 100,
    collapsible: true,
    resizable: true,
    closable: false,
    ...overrides,
  }
}

function emptyTabGroup(): TabGroup {
  return {
    tabs: [],
    activeTabId: null,
    tabBarVisible: false,
    overflow: 'scroll',
  }
}

function leaf(
  id: string,
  role: SlotRole,
  constraintOverrides?: Partial<SlotConstraints>
): SlotLeaf {
  return {
    type: 'leaf',
    id,
    role,
    collapsed: false,
    constraints: defaultConstraints(constraintOverrides),
    tabGroup: emptyTabGroup(),
  }
}

// 已知 SlotRole 集合，用于从 slot ID 推断 role
const KNOWN_ROLES = new Set<SlotRole>(['primary', 'secondary', 'navigator', 'companion'])

/**
 * 从 slot ID 推断 SlotRole。
 * 若 ID 本身就是已知 role 名，直接使用；否则退化为传入的默认 role。
 */
function inferRole(id: string, fallback: SlotRole): SlotRole {
  return KNOWN_ROLES.has(id as SlotRole) ? (id as SlotRole) : fallback
}

/**
 * 按位置从 slotIds 中取 ID，若不足则退化为 defaultId。
 */
function slotId(slotIds: string[] | undefined, position: number, defaultId: string): string {
  return slotIds?.[position] ?? defaultId
}

// ─── 公开 API ─────────────────────────────────────────────────────────────────

/**
 * 将 v8.1 Pattern 转换为 SlotGrid 树。
 *
 * Pattern 决定结构（列数、尺寸比例、方向），slotIds 决定叶子节点的 ID。
 * 当 slotIds 缺省时退化为内置默认值，保持向后兼容。
 *
 * @param pattern   - 布局模式
 * @param splitCount - split-n 模式的分割数量（默认 3）
 * @param slotIds   - 场景声明的 slot ID 列表，按位置映射到叶子节点（可选）
 */
export function patternToGrid(
  pattern: LayoutPattern | 'split-n',
  splitCount = 3,
  slotIds?: string[]
): SlotGrid {
  switch (pattern) {
    case 'solo': {
      // solo: 1 个叶子，位置 0
      const id0 = slotId(slotIds, 0, 'primary')
      return {
        orientation: 'horizontal',
        children: [leaf(id0, inferRole(id0, 'primary'), { minWidth: 320, collapsible: false })],
        sizes: [1],
      }
    }

    case 'sidebar-main': {
      // sidebar-main: 左侧边栏(位置 0) + 右主区(位置 1)
      const id0 = slotId(slotIds, 0, 'navigator')
      const id1 = slotId(slotIds, 1, 'primary')
      return {
        orientation: 'horizontal',
        children: [
          leaf(id0, inferRole(id0, 'navigator'), { minWidth: 200, collapsible: true }),
          leaf(id1, inferRole(id1, 'primary'),    { minWidth: 320, collapsible: false }),
        ],
        sizes: [0.25, 0.75],
      }
    }

    case 'main-sidebar': {
      // main-sidebar: 左主区(位置 0) + 右侧边栏(位置 1)
      const id0 = slotId(slotIds, 0, 'primary')
      const id1 = slotId(slotIds, 1, 'secondary')
      return {
        orientation: 'horizontal',
        children: [
          leaf(id0, inferRole(id0, 'primary'),    { minWidth: 320, collapsible: false }),
          leaf(id1, inferRole(id1, 'secondary'),  { minWidth: 240, collapsible: true }),
        ],
        sizes: [0.6, 0.4],
      }
    }

    case 'triple': {
      // triple: 左导航(位置 0) + 中主区(位置 1) + 右侧边栏(位置 2)
      const id0 = slotId(slotIds, 0, 'navigator')
      const id1 = slotId(slotIds, 1, 'primary')
      const id2 = slotId(slotIds, 2, 'secondary')
      return {
        orientation: 'horizontal',
        children: [
          leaf(id0, inferRole(id0, 'navigator'), { minWidth: 180, collapsible: true }),
          leaf(id1, inferRole(id1, 'primary'),   { minWidth: 320, collapsible: false }),
          leaf(id2, inferRole(id2, 'secondary'), { minWidth: 240, collapsible: true }),
        ],
        sizes: [0.2, 0.5, 0.3],
      }
    }

    case 'split-n': {
      // split-n 为会议室模式，参与者 ID 由 splitCount 动态生成，不受 slotIds 影响
      const n = Math.max(2, splitCount)
      return {
        orientation: 'horizontal',
        children: Array.from({ length: n }, (_, i) =>
          leaf(`participant-${i}`, 'primary', { minWidth: 200, collapsible: false })
        ),
        sizes: Array(n).fill(1 / n),
      }
    }

    default:
      // 未知 pattern → solo fallback
      return {
        orientation: 'horizontal',
        children: [leaf('primary', 'primary', { minWidth: 320, collapsible: false })],
        sizes: [1],
      }
  }
}

// ─── Grid 组合 ──────────────────────────────────────────────────────────────

/**
 * 正交修饰器配置。Pattern 管水平结构，Modifier 管垂直扩展。
 *
 * 组合 > 枚举: 5 pattern × 2 bottom × 2 companion = 20 种组合不可能穷举。
 * composeGrid 保持 patternToGrid 的简洁性，正交修饰各自演进。
 */
export interface GridModifiers {
  /** 底部面板 — 将基础 grid 包裹在 vertical root 中 */
  bottom?: {
    id?: string
    constraints?: Partial<SlotConstraints>
    initialSize?: number       // 占总高比例, 默认 0.3
    initialCollapsed?: boolean // 默认 true
  }
  /** 伴侣面板 — 在指定 leaf 旁创建垂直分支 */
  companion?: {
    id?: string
    attachTo?: string          // 附着目标 leaf ID, 默认 'secondary'
    constraints?: Partial<SlotConstraints>
    initialSize?: number       // 占 branch 比例, 默认 0.4
    initialCollapsed?: boolean // 默认 false
  }
}

/**
 * 在基础 grid 上正交组合 bottom / companion 修饰。
 *
 * 执行顺序: companion (内部嵌套) → bottom (外部包裹)。
 * 这保证 companion 嵌入 horizontal 结构后，整体再被 vertical root 包裹。
 *
 * 结构示例 (triple + companion + bottom):
 *
 *   SlotGrid (vertical)
 *   ├── SlotBranch (horizontal) [0.7]
 *   │   ├── navigator leaf
 *   │   ├── primary leaf
 *   │   └── SlotBranch (vertical)
 *   │       ├── secondary leaf [0.6]
 *   │       └── companion leaf [0.4]
 *   └── bottom leaf [0.3]
 */
export function composeGrid(baseGrid: SlotGrid, modifiers: GridModifiers): SlotGrid {
  let grid = baseGrid

  // 1. Companion: 找到 attachTo leaf → 替换为 vertical branch [leaf, companion]
  if (modifiers.companion) {
    const m = modifiers.companion
    const targetId = m.attachTo ?? 'secondary'
    const companionId = m.id ?? 'companion'
    const companionSize = m.initialSize ?? 0.4
    const companionLeaf = leaf(companionId, inferRole(companionId, 'companion'), {
      minWidth: 200,
      minHeight: 100,
      collapsible: true,
    })
    if (m.initialCollapsed) companionLeaf.collapsed = true
    if (m.constraints) Object.assign(companionLeaf.constraints, m.constraints)

    grid = nestCompanion(grid, targetId, companionLeaf, companionSize)
  }

  // 2. Bottom: 将整个 grid 包裹为 vertical root [branch(grid), bottom]
  if (modifiers.bottom) {
    const m = modifiers.bottom
    const bottomId = m.id ?? 'bottom'
    const bottomSize = m.initialSize ?? 0.3
    const bottomLeaf = leaf(bottomId, 'bottom', {
      minWidth: 0,
      minHeight: 80,
      collapsible: true,
      resizable: true,
    })
    if (m.initialCollapsed !== false) bottomLeaf.collapsed = true
    if (m.constraints) Object.assign(bottomLeaf.constraints, m.constraints)

    grid = {
      orientation: 'vertical',
      children: [
        { type: 'branch', orientation: grid.orientation, children: grid.children, sizes: grid.sizes },
        bottomLeaf,
      ],
      sizes: [1 - bottomSize, bottomSize],
    }
  }

  return grid
}

/**
 * 在 grid 树中找到 targetId 的 leaf，将其替换为
 * vertical branch [originalLeaf, companionLeaf]。
 *
 * 如果 targetId 不存在，companion 直接追加到根 children 末尾作为独立 leaf。
 */
function nestCompanion(
  grid: SlotGrid,
  targetId: string,
  companionLeaf: SlotLeaf,
  companionSize: number,
): SlotGrid {
  let found = false

  function replaceInChildren(
    children: SlotGrid['children'],
    sizes: number[],
  ): { children: SlotGrid['children']; sizes: number[] } {
    const newChildren = children.map((child) => {
      if (found) return child
      if (child.type === 'leaf' && child.id === targetId) {
        found = true
        // 将 leaf 替换为 vertical branch [leaf, companion]
        const branch: SlotBranch = {
          type: 'branch',
          orientation: 'vertical',
          children: [child, companionLeaf],
          sizes: [1 - companionSize, companionSize],
        }
        return branch
      }
      if (child.type === 'branch') {
        const result = replaceInChildren(child.children, child.sizes)
        if (found) return { ...child, children: result.children, sizes: result.sizes }
      }
      return child
    })
    return { children: newChildren, sizes }
  }

  const result = replaceInChildren(grid.children, grid.sizes)
  if (found) {
    return { ...grid, children: result.children, sizes: result.sizes }
  }

  // targetId 不存在 → companion 作为独立 leaf 追加到根
  return {
    ...grid,
    children: [...grid.children, companionLeaf],
    sizes: redistributeSizes(grid.sizes, companionSize),
  }
}

/**
 * 在现有 sizes 末尾追加一个新 slot，按比例缩放现有 sizes。
 */
function redistributeSizes(existingSizes: number[], newSlotSize: number): number[] {
  const scale = 1 - newSlotSize
  return [...existingSizes.map(s => s * scale), newSlotSize]
}

/**
 * 从 SlotGrid 中提取扁平 leaf 列表（BFS 顺序）。
 */
export function flattenLeaves(grid: SlotGrid): SlotLeaf[] {
  const result: SlotLeaf[] = []

  function traverse(nodes: SlotGrid['children']) {
    for (const node of nodes) {
      if (node.type === 'leaf') {
        result.push(node)
      } else {
        traverse(node.children)
      }
    }
  }

  traverse(grid.children)
  return result
}
