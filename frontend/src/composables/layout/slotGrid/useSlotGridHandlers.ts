/**
 * useSlotGridHandlers — 为 Portal 提供 SlotGrid 事件处理 + 服务端布局同步
 *
 * 职责:
 * 1. 封装 drop / tab-activate / tab-close / collapse 的标准事件处理
 * 2. Portal mount 时从服务端异步拉取布局并应用 (SSOT = server)
 * 3. 注册键盘快捷键 (useSlotGridKeys)
 *
 * Portal 只需一行: const handlers = useSlotGridHandlers({ ... })
 */

import { ref, onMounted, type Ref } from 'vue'
import type { DragPayload, DropTarget } from './types'
import type { SlotGridReturn } from './useSlotGrid'
import { saveSlotGridLayout, fetchServerLayout } from './persistence'
import { useSlotGridKeys } from './useSlotGridKeys'

export interface DontDisturbAPI {
  close: (slotId: string) => void
  open: (slotId: string) => void
  isClosed: (slotId: string) => boolean
}

export interface SlotGridHandlersOptions {
  portalId: string
  scenario: Ref<string>
  platform: 'wails-macos' | 'wails-windows' | 'browser'
  slotGrid: SlotGridReturn
  dontDisturb?: DontDisturbAPI
}

export interface SlotGridHandlers {
  onDrop: (payload: DragPayload, target: DropTarget) => void
  onTabActivate: (leafId: string, tabId: string) => void
  onTabClose: (leafId: string, tabId: string) => void
  onCollapse: (leafId: string) => void
  /** Bug H5 修复: 双击 sash 重置等分大小 */
  onResizeReset: (parentPath: number[], index: number) => void
}

export function useSlotGridHandlers(options: SlotGridHandlersOptions): SlotGridHandlers {
  const { portalId, scenario, platform, slotGrid, dontDisturb } = options

  /** 持久化当前布局到服务端 KV (debounced) */
  function persist(): void {
    saveSlotGridLayout(portalId, scenario.value, platform, slotGrid.grid.value)
  }

  // ─── 事件处理器 ──────────────────────────────────────────────────────────────

  function onDrop(payload: DragPayload, target: DropTarget): void {
    if (payload.type === 'leaf') {
      if (payload.sourceLeafId !== target.leafId) {
        if (target.position === 'top' || target.position === 'bottom' || target.position === 'left' || target.position === 'right') {
          // 方向性拖拽: 移动 leaf 到目标旁（支持改变布局方向）
          slotGrid.moveLeaf(payload.sourceLeafId, target.leafId, target.position)
        } else {
          // center → 交换位置
          slotGrid.swapLeaves(payload.sourceLeafId, target.leafId)
        }
      }
    } else {
      // Tab 级拖拽
      if (target.position === 'center') {
        slotGrid.moveTab(payload.sourceLeafId, payload.tabId, target.leafId)
      } else {
        const newLeafId = `leaf-${Date.now()}`
        slotGrid.splitLeaf(target.leafId, target.position, { id: newLeafId, role: 'secondary' })
        slotGrid.moveTab(payload.sourceLeafId, payload.tabId, newLeafId)
      }
    }
    persist()
  }

  function onTabActivate(leafId: string, tabId: string): void {
    slotGrid.activateTab(leafId, tabId)
  }

  function onTabClose(leafId: string, tabId: string): void {
    slotGrid.closeTab(leafId, tabId)
    persist()
  }

  function onCollapse(leafId: string): void {
    slotGrid.toggleCollapse(leafId)
    if (dontDisturb) {
      dontDisturb.isClosed(leafId) ? dontDisturb.open(leafId) : dontDisturb.close(leafId)
    }
    persist()
  }

  // Bug H5 修复: 双击 sash → 重置该父节点下所有子节点为等分
  function onResizeReset(parentPath: number[], _index: number): void {
    slotGrid.resetSizes(parentPath)
    persist()
  }

  // ─── 服务端布局同步 (mount 时拉取) ──────────────────────────────────────────

  // Bug H3 修复: 版本计数器防止场景切换后的旧请求覆盖新布局
  let layoutFetchVersion = 0

  onMounted(async () => {
    const fetchScenario = scenario.value
    const myVersion = ++layoutFetchVersion
    try {
      const serverGrid = await fetchServerLayout(portalId, fetchScenario, platform)
      // 若场景已切换（版本不匹配），丢弃过期结果
      if (serverGrid && myVersion === layoutFetchVersion && scenario.value === fetchScenario) {
        slotGrid.restore(JSON.stringify(serverGrid))
      }
    } catch {
      // 网络失败静默 — 使用 pattern 默认布局
    }
  })

  // ─── 键盘快捷键 ──────────────────────────────────────────────────────────────

  const activeLeafId = ref<string | null>(null)
  // Bug H4 修复: 传入 persist 回调，快捷键触发的布局变更也会持久化
  useSlotGridKeys({ grid: slotGrid, activeLeafId, persist })

  return { onDrop, onTabActivate, onTabClose, onCollapse, onResizeReset }
}
