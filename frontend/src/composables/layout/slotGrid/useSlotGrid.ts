/**
 * useSlotGrid — SlotGrid 布局引擎核心 Composable
 *
 * 管理布局树状态，提供 resize / collapse / tab 操作 API，
 * 以及序列化/反序列化接口。
 *
 * 参考: DPF-FINAL-SPEC 附录 E §E.3
 */

import { ref, computed, readonly } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { SlotGrid, SlotNode, SlotLeaf, SlotBranch, SlotGridState, Tab } from './types'
import { buildGridCSS, adjustSizes, normalizeSizes } from './buildGridCSS'
import { flattenLeaves } from './patternToGrid'
import type { SlotRole } from './types'

// ─── 返回类型 ─────────────────────────────────────────────────────────────────

export interface SlotGridReturn {
  // 状态
  state: Readonly<Ref<SlotGridState>>
  grid: ComputedRef<SlotGrid>
  flatLeaves: ComputedRef<SlotLeaf[]>

  // CSS 样式（根级别）
  gridStyle: ComputedRef<{ gridTemplateColumns?: string; gridTemplateRows?: string }>

  // Resize 操作
  // Bug H1 修复: 同时接收宽高，内部根据分支方向选用正确维度
  resizeSlot(parentPath: number[], index: number, deltaPx: number, containerWidth: number, containerHeight: number): void

  // Collapse / Expand
  collapseLeaf(leafId: string): void
  expandLeaf(leafId: string): void
  toggleCollapse(leafId: string): void

  // Tab 操作
  openTab(leafId: string, tab: Tab, options?: { activate?: boolean; pinned?: boolean }): void
  closeTab(leafId: string, tabId: string): void
  moveTab(fromLeafId: string, tabId: string, toLeafId: string, index?: number): void
  activateTab(leafId: string, tabId: string): void
  reorderTab(leafId: string, fromIndex: number, toIndex: number): void

  // Resize 重置
  // Bug H5 修复: 双击 sash 重置为等分
  resetSizes(parentPath: number[]): void

  // 分割 / 合并 / 交换 / 移动
  splitLeaf(
    leafId: string,
    direction: 'left' | 'right' | 'top' | 'bottom',
    newLeaf: Partial<SlotLeaf>
  ): void
  swapLeaves(leafIdA: string, leafIdB: string): void
  /** 将 source leaf 移动到 target leaf 旁（按方向插入，支持改变布局方向） */
  moveLeaf(sourceLeafId: string, targetLeafId: string, direction: 'top' | 'bottom' | 'left' | 'right'): void

  // 查找
  findLeaf(role: SlotRole): SlotLeaf | null
  findLeafById(id: string): SlotLeaf | null

  // 序列化
  serialize(): string
  restore(saved: string): void
}

// ─── 树操作工具 ───────────────────────────────────────────────────────────────

/** 遍历树，定位并更新指定 leaf，返回新树 */
function mapLeaf(
  nodes: SlotNode[],
  leafId: string,
  updater: (leaf: SlotLeaf) => SlotLeaf
): SlotNode[] {
  return nodes.map((node) => {
    if (node.type === 'leaf') {
      return node.id === leafId ? updater(node) : node
    }
    return {
      ...node,
      children: mapLeaf(node.children, leafId, updater),
    }
  })
}

/** 在 parentPath 定位 branch，并对其 sizes 进行修改 */
function mapBranchSizes(
  grid: SlotGrid,
  parentPath: number[],
  updater: (branch: SlotBranch) => SlotBranch
): SlotGrid {
  if (parentPath.length === 0) {
    // 根级别: SlotGrid 的 sizes
    const fakeRoot: SlotBranch = {
      type: 'branch',
      orientation: grid.orientation,
      children: grid.children,
      sizes: grid.sizes,
    }
    const updated = updater(fakeRoot)
    return { ...grid, sizes: updated.sizes, children: updated.children }
  }

  function traverse(nodes: SlotNode[], path: number[]): SlotNode[] {
    const [head, ...rest] = path
    return nodes.map((node, i) => {
      if (i !== head || node.type !== 'branch') return node
      if (rest.length === 0) {
        return updater(node)
      }
      return { ...node, children: traverse(node.children, rest) }
    })
  }

  return { ...grid, children: traverse(grid.children, parentPath) }
}

// ─── Composable ───────────────────────────────────────────────────────────────

export function useSlotGrid(initialGrid: SlotGrid): SlotGridReturn {
  const state = ref<SlotGridState>({
    grid: initialGrid,
    activeSlotId: null,
    collapsedSlots: new Set<string>(),
  })

  // ── computed ──────────────────────────────────────────────────────────────

  const grid = computed(() => state.value.grid)

  const flatLeaves = computed(() => flattenLeaves(state.value.grid))

  const gridStyle = computed(() =>
    buildGridCSS(state.value.grid, state.value.collapsedSlots)
  )

  // ── Resize ────────────────────────────────────────────────────────────────

  function resizeSlot(
    parentPath: number[],
    index: number,
    deltaPx: number,
    containerWidth: number,
    containerHeight: number
  ): void {
    state.value = {
      ...state.value,
      grid: mapBranchSizes(state.value.grid, parentPath, (branch) => {
        // Bug H1 修复: 垂直分支（上下分割）用高度和 minHeight，水平分支用宽度和 minWidth
        const isVertical = branch.orientation === 'vertical'
        const containerPx = isVertical ? containerHeight : containerWidth

        const minBefore = branch.children[index]?.type === 'leaf'
          ? (isVertical
              ? ((branch.children[index] as SlotLeaf).constraints.minHeight ?? 100)
              : ((branch.children[index] as SlotLeaf).constraints.minWidth ?? 200))
          : 100
        const minAfter = branch.children[index + 1]?.type === 'leaf'
          ? (isVertical
              ? ((branch.children[index + 1] as SlotLeaf).constraints.minHeight ?? 100)
              : ((branch.children[index + 1] as SlotLeaf).constraints.minWidth ?? 200))
          : 100

        return {
          ...branch,
          sizes: adjustSizes(branch.sizes, index, deltaPx, containerPx, minBefore, minAfter),
        }
      }),
    }
  }

  // ── Resize 重置 ───────────────────────────────────────────────────────────

  /**
   * Bug H5 修复: 双击 sash 触发重置 — 将指定父节点下的所有子节点恢复为等分
   */
  function resetSizes(parentPath: number[]): void {
    state.value = {
      ...state.value,
      grid: mapBranchSizes(state.value.grid, parentPath, (branch) => {
        const count = branch.children.length
        if (count === 0) return branch
        const equalSize = 1 / count
        return {
          ...branch,
          sizes: Array.from({ length: count }, () => equalSize),
        }
      }),
    }
  }

  // ── Collapse / Expand ─────────────────────────────────────────────────────

  function collapseLeaf(leafId: string): void {
    const newCollapsed = new Set(state.value.collapsedSlots)
    newCollapsed.add(leafId)
    state.value = {
      ...state.value,
      collapsedSlots: newCollapsed,
      grid: {
        ...state.value.grid,
        children: mapLeaf(state.value.grid.children, leafId, (l) => ({
          ...l,
          collapsed: true,
        })),
      },
    }
  }

  function expandLeaf(leafId: string): void {
    const newCollapsed = new Set(state.value.collapsedSlots)
    newCollapsed.delete(leafId)
    state.value = {
      ...state.value,
      collapsedSlots: newCollapsed,
      grid: {
        ...state.value.grid,
        children: mapLeaf(state.value.grid.children, leafId, (l) => ({
          ...l,
          collapsed: false,
        })),
      },
    }
  }

  function toggleCollapse(leafId: string): void {
    if (state.value.collapsedSlots.has(leafId)) {
      expandLeaf(leafId)
    } else {
      collapseLeaf(leafId)
    }
  }

  // ── Tab 操作 ──────────────────────────────────────────────────────────────

  function openTab(
    leafId: string,
    tab: Tab,
    options: { activate?: boolean; pinned?: boolean } = {}
  ): void {
    const { activate = true, pinned = false } = options
    state.value = {
      ...state.value,
      grid: {
        ...state.value.grid,
        children: mapLeaf(state.value.grid.children, leafId, (leaf) => {
          const existing = leaf.tabGroup.tabs.find((t) => t.id === tab.id)
          const tabs = existing
            ? leaf.tabGroup.tabs
            : [...leaf.tabGroup.tabs, { ...tab, pinned }]
          return {
            ...leaf,
            tabGroup: {
              ...leaf.tabGroup,
              tabs,
              activeTabId: activate ? tab.id : leaf.tabGroup.activeTabId,
              tabBarVisible: tabs.length > 1,
            },
          }
        }),
      },
    }
  }

  function closeTab(leafId: string, tabId: string): void {
    state.value = {
      ...state.value,
      grid: {
        ...state.value.grid,
        children: mapLeaf(state.value.grid.children, leafId, (leaf) => {
          const pinned = leaf.tabGroup.tabs.find((t) => t.id === tabId)?.pinned
          if (pinned) return leaf // pinned tab 不可关闭

          const tabs = leaf.tabGroup.tabs.filter((t) => t.id !== tabId)
          const activeTabId =
            leaf.tabGroup.activeTabId === tabId
              ? (tabs[tabs.length - 1]?.id ?? null)
              : leaf.tabGroup.activeTabId
          return {
            ...leaf,
            tabGroup: {
              ...leaf.tabGroup,
              tabs,
              activeTabId,
              tabBarVisible: tabs.length > 1,
            },
          }
        }),
      },
    }
  }

  function activateTab(leafId: string, tabId: string): void {
    state.value = {
      ...state.value,
      activeSlotId: leafId,
      grid: {
        ...state.value.grid,
        children: mapLeaf(state.value.grid.children, leafId, (leaf) => ({
          ...leaf,
          tabGroup: { ...leaf.tabGroup, activeTabId: tabId },
        })),
      },
    }
  }

  function reorderTab(leafId: string, fromIndex: number, toIndex: number): void {
    state.value = {
      ...state.value,
      grid: {
        ...state.value.grid,
        children: mapLeaf(state.value.grid.children, leafId, (leaf) => {
          const tabs = [...leaf.tabGroup.tabs]
          const [moved] = tabs.splice(fromIndex, 1)
          if (moved) tabs.splice(toIndex, 0, moved)
          return { ...leaf, tabGroup: { ...leaf.tabGroup, tabs } }
        }),
      },
    }
  }

  function moveTab(fromLeafId: string, tabId: string, toLeafId: string, index?: number): void {
    // 找到要移动的 tab
    const fromLeaf = findLeafById(fromLeafId)
    if (!fromLeaf) return
    const tab = fromLeaf.tabGroup.tabs.find((t) => t.id === tabId)
    if (!tab) return

    // 先关闭源 tab，再在目标 leaf 打开
    closeTab(fromLeafId, tabId)

    state.value = {
      ...state.value,
      grid: {
        ...state.value.grid,
        children: mapLeaf(state.value.grid.children, toLeafId, (leaf) => {
          const tabs = [...leaf.tabGroup.tabs]
          if (index !== undefined) {
            tabs.splice(index, 0, tab)
          } else {
            tabs.push(tab)
          }
          return {
            ...leaf,
            tabGroup: {
              ...leaf.tabGroup,
              tabs,
              activeTabId: tabId,
              tabBarVisible: tabs.length > 1,
            },
          }
        }),
      },
    }
  }

  // ── 分割操作 ──────────────────────────────────────────────────────────────

  function splitLeaf(
    leafId: string,
    direction: 'left' | 'right' | 'top' | 'bottom',
    newLeafPartial: Partial<SlotLeaf>
  ): void {
    const newLeaf: SlotLeaf = {
      type: 'leaf',
      id: newLeafPartial.id ?? `slot-${Date.now()}`,
      role: newLeafPartial.role ?? 'secondary',
      collapsed: false,
      constraints: {
        minWidth: 200,
        minHeight: 100,
        collapsible: true,
        resizable: true,
        closable: true,
        ...newLeafPartial.constraints,
      },
      tabGroup: newLeafPartial.tabGroup ?? {
        tabs: [],
        activeTabId: null,
        tabBarVisible: false,
        overflow: 'scroll',
      },
    }

    const orientation =
      direction === 'left' || direction === 'right' ? 'horizontal' : 'vertical'
    const insertBefore = direction === 'left' || direction === 'top'

    function doSplit(nodes: SlotNode[]): SlotNode[] {
      return nodes.flatMap((node) => {
        if (node.type === 'branch') {
          return [{ ...node, children: doSplit(node.children) }]
        }
        if (node.id !== leafId) return [node]

        // 找到目标 leaf，替换为 branch 包含原 leaf + 新 leaf
        const siblings: SlotNode[] = insertBefore
          ? [newLeaf, node]
          : [node, newLeaf]

        return [
          {
            type: 'branch' as const,
            orientation,
            children: siblings,
            sizes: [0.5, 0.5],
          } satisfies SlotBranch,
        ]
      })
    }

    state.value = {
      ...state.value,
      grid: {
        ...state.value.grid,
        children: doSplit(state.value.grid.children),
        sizes: normalizeSizes(state.value.grid.sizes),
      },
    }
  }

  // ── 查找 ──────────────────────────────────────────────────────────────────

  function findLeaf(role: SlotRole): SlotLeaf | null {
    return flatLeaves.value.find((l) => l.role === role) ?? null
  }

  function findLeafById(id: string): SlotLeaf | null {
    return flatLeaves.value.find((l) => l.id === id) ?? null
  }

  // ── 序列化 ────────────────────────────────────────────────────────────────

  function serialize(): string {
    return JSON.stringify(state.value.grid)
  }

  function restore(saved: string): void {
    try {
      const parsed: SlotGrid = JSON.parse(saved)
      state.value = {
        grid: parsed,
        activeSlotId: null,
        collapsedSlots: new Set<string>(),
      }
    } catch {
      // 数据损坏则静默忽略
    }
  }

  // ─── Leaf 交换 ──────────────────────────────────────────────────────────────

  /**
   * 交换两个 leaf 在树中的位置。
   * 支持同层和跨层交换。用于面板级拖拽互换。
   */
  function swapLeaves(leafIdA: string, leafIdB: string): void {
    if (leafIdA === leafIdB) return
    const g = state.value.grid

    // 在树中定位两个 leaf 节点
    let nodeA: SlotNode | null = null
    let nodeB: SlotNode | null = null

    function find(node: SlotNode, targetId: string): SlotNode | null {
      if (node.type === 'leaf') return (node as SlotLeaf).id === targetId ? node : null
      const branch = node as SlotBranch
      for (const child of branch.children) {
        const found = find(child, targetId)
        if (found) return found
      }
      return null
    }

    for (const child of g.children) {
      if (!nodeA) nodeA = find(child, leafIdA)
      if (!nodeB) nodeB = find(child, leafIdB)
    }

    if (!nodeA || !nodeB) return

    // 交换: 深拷贝两节点内容，原地替换
    function replaceInTree(children: SlotNode[]): SlotNode[] {
      return children.map((node) => {
        if (node.type === 'leaf') {
          const leaf = node as SlotLeaf
          if (leaf.id === leafIdA) return { ...(nodeB as SlotLeaf) }
          if (leaf.id === leafIdB) return { ...(nodeA as SlotLeaf) }
          return node
        }
        const branch = node as SlotBranch
        return {
          ...branch,
          children: replaceInTree(branch.children),
        }
      })
    }

    state.value = {
      ...state.value,
      grid: {
        ...g,
        children: replaceInTree(g.children),
      },
    }
  }

  // ─── Leaf 移动（支持方向性插入，改变布局方向）────────────────────────────────────

  /**
   * 将 source leaf 从树中提取，然后以 direction 方向插入到 target leaf 旁。
   * - left/right → 水平分割 (horizontal branch)
   * - top/bottom → 垂直分割 (vertical branch)
   * 支持跨层移动；source leaf 原位置若父 branch 仅剩1子，则扁平化该 branch。
   */
  function moveLeaf(sourceLeafId: string, targetLeafId: string, direction: 'top' | 'bottom' | 'left' | 'right'): void {
    if (sourceLeafId === targetLeafId) return

    const g = state.value.grid

    // 1. 找到并提取 source leaf 节点
    const sourceLeaf = flatLeaves.value.find((l) => l.id === sourceLeafId)
    if (!sourceLeaf) return

    // 2. 从树中移除 source leaf，parent branch 仅1子时扁平化
    function removeLeaf(nodes: SlotNode[]): { nodes: SlotNode[]; removed: boolean } {
      const result: SlotNode[] = []
      let removed = false
      for (const node of nodes) {
        if (node.type === 'leaf') {
          if ((node as SlotLeaf).id === sourceLeafId) {
            removed = true
            // 不加入 result，即删除
          } else {
            result.push(node)
          }
        } else {
          const branch = node as SlotBranch
          const inner = removeLeaf(branch.children)
          if (inner.removed) {
            removed = true
            if (inner.nodes.length === 1) {
              // 扁平化: 单子 branch 提升子节点
              result.push(inner.nodes[0])
            } else if (inner.nodes.length === 0) {
              // branch 变空，丢弃
            } else {
              // 重新计算 sizes（均等分配）
              const newSizes = inner.nodes.map(() => 1 / inner.nodes.length)
              result.push({ ...branch, children: inner.nodes, sizes: newSizes })
            }
          } else {
            result.push(node)
          }
        }
      }
      return { nodes: result, removed }
    }

    const afterRemove = removeLeaf(g.children)
    if (!afterRemove.removed) return

    const orientation = direction === 'left' || direction === 'right' ? 'horizontal' : 'vertical'
    const insertBefore = direction === 'left' || direction === 'top'

    // 3. 在 target 位置插入新 branch
    function insertAtTarget(nodes: SlotNode[]): { nodes: SlotNode[]; inserted: boolean } {
      const result: SlotNode[] = []
      let inserted = false
      for (const node of nodes) {
        if (node.type === 'leaf') {
          if ((node as SlotLeaf).id === targetLeafId) {
            inserted = true
            const siblings: SlotNode[] = insertBefore
              ? [sourceLeaf, node]
              : [node, sourceLeaf]
            result.push({
              type: 'branch',
              orientation,
              children: siblings,
              sizes: [0.5, 0.5],
            } satisfies SlotBranch)
          } else {
            result.push(node)
          }
        } else {
          const branch = node as SlotBranch
          const inner = insertAtTarget(branch.children)
          if (inner.inserted) {
            inserted = true
            result.push({ ...branch, children: inner.nodes })
          } else {
            result.push(node)
          }
        }
      }
      return { nodes: result, inserted }
    }

    const afterInsert = insertAtTarget(afterRemove.nodes)
    if (!afterInsert.inserted) return

    state.value = {
      ...state.value,
      grid: {
        ...g,
        children: afterInsert.nodes,
        sizes: normalizeSizes(afterInsert.nodes.map(() => 1 / afterInsert.nodes.length)),
      },
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  return {
    state: readonly(state),
    grid,
    flatLeaves,
    gridStyle,
    resizeSlot,
    resetSizes,
    collapseLeaf,
    expandLeaf,
    toggleCollapse,
    openTab,
    closeTab,
    moveTab,
    activateTab,
    reorderTab,
    splitLeaf,
    swapLeaves,
    moveLeaf,
    findLeaf,
    findLeafById,
    serialize,
    restore,
  }
}
