/**
 * useSlotGridKeys — SlotGrid 键盘快捷键 Composable
 *
 * 注册全局键盘事件，将常用布局操作映射到快捷键。
 * 依赖 useSlotGrid 实例，不独立管理布局状态。
 */

import { onMounted, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import type { SlotGridReturn } from './useSlotGrid'
import type { SlotRole } from './types'

// ─── 接口 ─────────────────────────────────────────────────────────────────────

export interface SlotGridKeysOptions {
  /** 操作目标：useSlotGrid 实例 */
  grid: SlotGridReturn
  /** 当前获得焦点的 leaf ID */
  activeLeafId: Ref<string | null>
  /** 快捷键开关，false 时全部禁用（如文本输入期间） */
  enabled?: Ref<boolean>
  /** Bug H4 修复: 布局变更后调用此函数持久化 */
  persist?: () => void
}

// ─── 平台检测 ─────────────────────────────────────────────────────────────────

/** Mac 使用 Meta 键，其余平台使用 Ctrl 键 */
const isMac = typeof navigator !== 'undefined'
  ? /Mac|iPhone|iPad|iPod/.test(navigator.platform)
  : false

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/** 判断当前焦点元素是否为可编辑控件 */
function isEditableElement(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true
  if ((el as HTMLElement).isContentEditable) return true
  return false
}

/** 判断事件是否匹配修饰键（主键 = Mac Meta / 其他 Ctrl） */
function hasPrimaryModifier(e: KeyboardEvent): boolean {
  return isMac ? e.metaKey : e.ctrlKey
}

// ─── Composable ───────────────────────────────────────────────────────────────

export function useSlotGridKeys(options: SlotGridKeysOptions): void {
  const { grid, activeLeafId, enabled, persist } = options

  // ── 焦点跟踪：监听 focusin，更新 activeLeafId ─────────────────────────────

  function onFocusIn(e: FocusEvent): void {
    const target = e.target as Element | null
    if (!target) return

    // 向上查找最近的 [data-leaf-id] 祖先
    const leaf = target.closest('[data-leaf-id]')
    if (leaf) {
      const id = (leaf as HTMLElement).dataset['leafId'] ?? null
      if (id) activeLeafId.value = id
    }
  }

  // ── 快捷键主处理器 ────────────────────────────────────────────────────────

  function onKeyDown(e: KeyboardEvent): void {
    // 全局开关
    if (enabled && !enabled.value) return

    // 可编辑控件内禁用（避免干扰文本输入）
    if (isEditableElement(document.activeElement)) return

    // 必须有主修饰键
    if (!hasPrimaryModifier(e)) return

    const key = e.key
    const shift = e.shiftKey
    const leafId = activeLeafId.value

    // ── Cmd+\ : 向右分割当前 leaf ────────────────────────────────────────
    if (key === '\\' && !shift) {
      if (!leafId) return
      e.preventDefault()
      grid.splitLeaf(leafId, 'right', {})
      persist?.()
      return
    }

    // ── Cmd+W : 关闭当前 leaf 的激活 tab ─────────────────────────────────
    if (key === 'w' && !shift) {
      if (!leafId) return
      const leaf = grid.findLeafById(leafId)
      if (!leaf) return
      const tabId = leaf.tabGroup.activeTabId
      if (!tabId) return
      e.preventDefault() // 阻止浏览器关闭标签页
      grid.closeTab(leafId, tabId)
      persist?.()
      return
    }

    // ── Cmd+Shift+[ : 切换到上一个 tab ───────────────────────────────────
    if (key === '[' && shift) {
      if (!leafId) return
      const leaf = grid.findLeafById(leafId)
      if (!leaf) return
      const tabs = leaf.tabGroup.tabs
      if (tabs.length < 2) return
      const currentIndex = tabs.findIndex((t) => t.id === leaf.tabGroup.activeTabId)
      const prevIndex = currentIndex <= 0 ? tabs.length - 1 : currentIndex - 1
      const prevTab = tabs[prevIndex]
      if (!prevTab) return
      e.preventDefault()
      grid.activateTab(leafId, prevTab.id)
      return
    }

    // ── Cmd+Shift+] : 切换到下一个 tab ───────────────────────────────────
    if (key === ']' && shift) {
      if (!leafId) return
      const leaf = grid.findLeafById(leafId)
      if (!leaf) return
      const tabs = leaf.tabGroup.tabs
      if (tabs.length < 2) return
      const currentIndex = tabs.findIndex((t) => t.id === leaf.tabGroup.activeTabId)
      const nextIndex = currentIndex >= tabs.length - 1 ? 0 : currentIndex + 1
      const nextTab = tabs[nextIndex]
      if (!nextTab) return
      e.preventDefault()
      grid.activateTab(leafId, nextTab.id)
      return
    }

    // ── Cmd+B : 切换 secondary 面板折叠 ──────────────────────────────────
    if (key === 'b' && !shift) {
      const secondaryLeaf = grid.findLeaf('secondary' as SlotRole)
      if (!secondaryLeaf) return
      e.preventDefault()
      grid.toggleCollapse(secondaryLeaf.id)
      persist?.()
      return
    }

    // ── Cmd+Shift+B : 切换 navigator 面板折叠 ────────────────────────────
    if (key === 'B' && shift) {
      const navigatorLeaf = grid.findLeaf('navigator' as SlotRole)
      if (!navigatorLeaf) return
      e.preventDefault()
      grid.toggleCollapse(navigatorLeaf.id)
      persist?.()
      return
    }
  }

  // ── 生命周期 ──────────────────────────────────────────────────────────────

  onMounted(() => {
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('focusin', onFocusIn)
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', onKeyDown)
    document.removeEventListener('focusin', onFocusIn)
  })
}
