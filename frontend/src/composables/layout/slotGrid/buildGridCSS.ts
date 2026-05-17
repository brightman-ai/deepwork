/**
 * SlotGrid → CSS Grid 模板字符串转换 (纯函数)
 *
 * 将 SlotGrid 树转换为 CSS grid-template-columns / grid-template-rows。
 * 折叠的 slot → "0fr"，带 transition 使折叠动画平滑。
 *
 * 示例:
 *   sizes=[0.25, 0.5, 0.25] → "25fr 50fr 25fr"
 *   sizes=[0.25, 0.5, 0.25], collapsed={"slot-1"} → "0fr 50fr 25fr"
 */

import type { SlotGrid, SlotNode, SlotLeaf } from './types'

export interface GridCSSResult {
  gridTemplateColumns?: string
  gridTemplateRows?: string
}

/**
 * 将 SlotGrid 树的顶层转换为 CSS grid-template 字符串。
 * 只处理根节点的 orientation，深层嵌套由子组件递归调用。
 */
export function buildGridCSS(grid: SlotGrid, collapsedSlots: Set<string>): GridCSSResult {
  const template = buildTemplate(grid.children, grid.sizes, collapsedSlots)

  if (grid.orientation === 'horizontal') {
    return { gridTemplateColumns: template }
  } else {
    return { gridTemplateRows: template }
  }
}

/**
 * 将 SlotBranch 的 children 转换为模板字符串，考虑折叠状态。
 * Sash (分割线) 占 4px，用 4px 固定值插入相邻项之间。
 */
function buildTemplate(
  children: SlotNode[],
  sizes: number[],
  collapsedSlots: Set<string>
): string {
  const parts: string[] = []

  children.forEach((node, index) => {
    if (index > 0) {
      // Sash 占 4px 固定宽度
      parts.push('4px')
    }

    if (node.type === 'leaf') {
      const leaf = node as SlotLeaf
      if (collapsedSlots.has(leaf.id) || leaf.collapsed) {
        parts.push('28px')
      } else {
        // 将 0-1 比例转换为 fr 单位 (乘以 100 避免浮点精度问题)
        const size = sizes[index] ?? (1 / children.length)
        const frValue = Math.round(size * 100)
        parts.push(`${Math.max(1, frValue)}fr`)
      }
    } else {
      // branch 节点: 按 sizes[index] 比例分配
      const size = sizes[index] ?? (1 / children.length)
      const frValue = Math.round(size * 100)
      parts.push(`${Math.max(1, frValue)}fr`)
    }
  })

  return parts.join(' ')
}

/**
 * 构建 SlotBranch 子级的 CSS (供嵌套 branch 递归使用)。
 */
export function buildBranchCSS(
  children: SlotNode[],
  sizes: number[],
  orientation: 'horizontal' | 'vertical',
  collapsedSlots: Set<string>
): GridCSSResult {
  const template = buildTemplate(children, sizes, collapsedSlots)

  if (orientation === 'horizontal') {
    return { gridTemplateColumns: template }
  } else {
    return { gridTemplateRows: template }
  }
}

/**
 * 重新归一化 sizes 数组：确保总和为 1。
 * 用于折叠/展开后重新分配比例。
 */
export function normalizeSizes(sizes: number[]): number[] {
  const total = sizes.reduce((sum, s) => sum + s, 0)
  if (total === 0) return sizes.map(() => 1 / sizes.length)
  return sizes.map((s) => s / total)
}

/**
 * 调整相邻两项的 sizes（用于 sash 拖拽）。
 * @param sizes 当前 sizes 数组
 * @param index 左/上侧项的索引
 * @param delta 比例变化量 (正 = 左/上变大, 负 = 左/上变小)
 * @param containerPx 容器像素宽度/高度（用于计算 delta 的比例）
 * @param minBeforePx 左/上侧最小像素
 * @param minAfterPx 右/下侧最小像素
 */
export function adjustSizes(
  sizes: number[],
  index: number,
  deltaPx: number,
  containerPx: number,
  minBeforePx: number,
  minAfterPx: number
): number[] {
  if (containerPx <= 0) return sizes

  const deltaFraction = deltaPx / containerPx
  const newSizes = [...sizes]

  const beforeRaw = newSizes[index] + deltaFraction
  const afterRaw = newSizes[index + 1] - deltaFraction

  const minBeforeFr = minBeforePx / containerPx
  const minAfterFr = minAfterPx / containerPx

  // 边界约束
  const before = Math.max(minBeforeFr, beforeRaw)
  const after = Math.max(minAfterFr, afterRaw)

  // 防止两者之和超过原有总量
  const originalTotal = newSizes[index] + newSizes[index + 1]
  const allocated = before + after

  if (allocated > originalTotal) {
    // 按比例缩减
    const scale = originalTotal / allocated
    newSizes[index] = before * scale
    newSizes[index + 1] = after * scale
  } else {
    newSizes[index] = before
    newSizes[index + 1] = after
  }

  return newSizes
}
