/**
 * useSlotDnd — SlotGrid 标签拖拽生命周期管理
 *
 * 职责:
 *   - 管理 idle → dragging → over-target 状态机
 *   - 创建/销毁 ghost 元素（DOM 直操，无 Vue 响应式）
 *   - 计算 drop 目标 zone (left/right/top/bottom/center)
 *   - 提供 provide/inject key 供子树注入
 *
 * 不渲染任何 DOM（纯 composable）
 */

import { ref, readonly, onUnmounted } from 'vue'
import type { InjectionKey } from 'vue'
import type { DragPayload, DropTarget } from './types'

// ─── 状态类型 ─────────────────────────────────────────────────────────────────

export interface DndState {
  phase: 'idle' | 'dragging' | 'over-target'
  payload: DragPayload | null
  target: DropTarget | null
  ghostPosition: { x: number; y: number } | null
}

// ─── Drop 结果 ────────────────────────────────────────────────────────────────

export interface DropResult {
  payload: DragPayload
  target: DropTarget
}

// ─── Composable 返回类型 ──────────────────────────────────────────────────────

export interface SlotDndReturn {
  state: Readonly<ReturnType<typeof ref<DndState>>>
  startDrag(payload: DragPayload, event: PointerEvent): void
  /** 仅更新 ghost 位置，不计算 drop target（高频 move 时用） */
  updateDrag(event: PointerEvent): void
  /** 更新 ghost 位置并同步计算 drop target（需传入 leaf 元素 Map） */
  updateDragWithTarget(event: PointerEvent, leafElements: Map<string, HTMLElement>): void
  endDrag(): DropResult | null
  cancelDrag(): void
  calculateDropTarget(
    event: PointerEvent,
    leafElements: Map<string, HTMLElement>
  ): DropTarget | null
}

// ─── Provide/Inject Key ───────────────────────────────────────────────────────

export const SLOT_DND_KEY: InjectionKey<SlotDndReturn> = Symbol('slot-dnd')

// ─── Ghost 常量 ───────────────────────────────────────────────────────────────

const GHOST_OFFSET_X = 12
const GHOST_OFFSET_Y = 12
const GHOST_Z_INDEX = 9999

// ─── Ghost 操作（纯 DOM，零 Vue 响应式开销）─────────────────────────────────

function createGhost(label: string, x: number, y: number): HTMLElement {
  const el = document.createElement('div')

  el.textContent = label
  el.setAttribute('aria-hidden', 'true')

  // 布局与定位
  Object.assign(el.style, {
    position: 'fixed',
    left: `${x + GHOST_OFFSET_X}px`,
    top: `${y + GHOST_OFFSET_Y}px`,
    zIndex: String(GHOST_Z_INDEX),
    pointerEvents: 'none',

    // 外观：匹配 tab 风格，半透明
    opacity: '0.8',
    padding: '4px 10px',
    borderRadius: '4px',
    fontSize: '13px',
    lineHeight: '20px',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    background: 'var(--q-primary, #1976d2)',
    color: '#fff',
    boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
    transition: 'none',
  })

  document.body.appendChild(el)
  return el
}

function moveGhost(el: HTMLElement, x: number, y: number): void {
  el.style.left = `${x + GHOST_OFFSET_X}px`
  el.style.top = `${y + GHOST_OFFSET_Y}px`
}

function removeGhost(el: HTMLElement | null): void {
  if (el && el.parentNode) el.parentNode.removeChild(el)
}

// ─── Drop Zone 计算 ───────────────────────────────────────────────────────────

/**
 * 根据光标位置和 leaf 元素矩形，确定 drop 落点。
 *
 * 边缘 25% → split 方向，中央 50% → center（同 leaf 内重排）。
 */
export function calculateDropTarget(
  event: PointerEvent,
  leafElements: Map<string, HTMLElement>
): DropTarget | null {
  const cx = event.clientX
  const cy = event.clientY

  for (const [leafId, el] of leafElements) {
    const rect = el.getBoundingClientRect()

    if (cx < rect.left || cx > rect.right || cy < rect.top || cy > rect.bottom) continue

    // 归一化坐标：(0,0) = 左上角，(1,1) = 右下角
    const rx = (cx - rect.left) / rect.width
    const ry = (cy - rect.top) / rect.height

    let position: DropTarget['position']

    if (rx < 0.25) {
      position = 'left'
    } else if (rx > 0.75) {
      position = 'right'
    } else if (ry < 0.25) {
      position = 'top'
    } else if (ry > 0.75) {
      position = 'bottom'
    } else {
      position = 'center'
    }

    return { leafId, position }
  }

  return null
}

// ─── Composable ───────────────────────────────────────────────────────────────

export function useSlotDnd(): SlotDndReturn {
  // 拖拽状态（Vue 响应式，供 DropZoneOverlay 订阅）
  const state = ref<DndState>({
    phase: 'idle',
    payload: null,
    target: null,
    ghostPosition: null,
  })

  // Ghost DOM 节点（非响应式，生命周期与 drag 阶段绑定）
  let ghostEl: HTMLElement | null = null

  // ── 全局 Pointer 监听器引用（cleanup 用）────────────────────────────────────

  function onPointerMove(event: PointerEvent): void {
    updateDrag(event)
  }

  function onPointerUp(): void {
    // Bug C4 修复: window 级 pointerup 只做兜底清理（指针在落区之外松开时）。
    // 正常 drop 流程由 DropZoneOverlay 的 pointerup → handleDrop() 处理，
    // handleDrop 内部会调用 endDrag() 并 emit drop 事件。
    // 若拖拽结束时没有命中任何落区，则此处取消拖拽防止悬挂状态。
    cancelDrag()
  }

  function onPointerCancel(): void {
    cancelDrag()
  }

  // ── 公开 API ─────────────────────────────────────────────────────────────────

  /**
   * 开始拖拽。
   * 调用方需在 pointerdown handler 中调用，并自行订阅 pointerup 以调用 endDrag()。
   * 或直接依赖 composable 内置全局监听器完成生命周期管理。
   */
  function startDrag(payload: DragPayload, event: PointerEvent): void {
    if (state.value.phase !== 'idle') return

    // 找到 tab label（调用方通过 payload 传入 tabId，label 由上层注入）
    // ghost 显示 tabId 作为占位（label 由 SlotGridRenderer 注入的元素读取）
    const label = (event.currentTarget as HTMLElement | null)?.textContent?.trim() ?? payload.tabId

    ghostEl = createGhost(label, event.clientX, event.clientY)

    state.value = {
      phase: 'dragging',
      payload,
      target: null,
      ghostPosition: { x: event.clientX, y: event.clientY },
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
  }

  /**
   * 更新拖拽位置。由全局 pointermove 驱动（亦可由调用方手动驱动）。
   * leafElements 参数由外部注入；若无，target 保持 null。
   */
  function updateDrag(event: PointerEvent): void {
    if (state.value.phase === 'idle') return

    if (ghostEl) moveGhost(ghostEl, event.clientX, event.clientY)

    state.value = {
      ...state.value,
      ghostPosition: { x: event.clientX, y: event.clientY },
    }
  }

  /**
   * 更新拖拽状态并同步 drop target（需外部传入 leafElements Map）。
   * 与 updateDrag 分离：updateDrag 只管 ghost 移动，此函数额外计算 target。
   */
  function updateDragWithTarget(
    event: PointerEvent,
    leafElements: Map<string, HTMLElement>
  ): void {
    if (state.value.phase === 'idle') return

    if (ghostEl) moveGhost(ghostEl, event.clientX, event.clientY)

    const target = calculateDropTarget(event, leafElements)

    state.value = {
      phase: target ? 'over-target' : 'dragging',
      payload: state.value.payload,
      target,
      ghostPosition: { x: event.clientX, y: event.clientY },
    }
  }

  /**
   * 结束拖拽，返回有效 drop 结果或 null。
   * 调用后状态重置为 idle，ghost 被销毁。
   */
  function endDrag(): DropResult | null {
    if (state.value.phase === 'idle') return null

    const { payload, target } = state.value
    cleanup()

    if (payload && target) {
      return { payload, target }
    }
    return null
  }

  /**
   * 取消拖拽，不产生 drop 结果。
   */
  function cancelDrag(): void {
    cleanup()
  }

  // ── 内部清理 ─────────────────────────────────────────────────────────────────

  function cleanup(): void {
    removeGhost(ghostEl)
    ghostEl = null

    state.value = {
      phase: 'idle',
      payload: null,
      target: null,
      ghostPosition: null,
    }

    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerCancel)
  }

  // ── 生命周期 ──────────────────────────────────────────────────────────────────

  // 组件卸载时确保全局监听器被清除
  onUnmounted(() => {
    if (state.value.phase !== 'idle') cleanup()
  })

  // ─────────────────────────────────────────────────────────────────────────────

  return {
    state: readonly(state) as Readonly<typeof state>,
    startDrag,
    updateDrag,
    updateDragWithTarget,
    endDrag,
    cancelDrag,
    calculateDropTarget,
  }
}
