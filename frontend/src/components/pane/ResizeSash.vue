<script setup lang="ts">
/**
 * ResizeSash — 两个相邻 slot 之间的可拖拽分割线
 *
 * - 4px 可见宽度，8px 命中区域 (::before 扩展)
 * - 拖拽时 emit resize(deltaPx)
 * - 双击重置 (emit reset)
 * - orientation: 'horizontal' → 垂直 sash (col-resize)
 *                'vertical'   → 水平 sash (row-resize)
 *
 * 参考: DPF-FINAL-SPEC 附录 E §E.7
 */

import { ref } from 'vue'

interface Props {
  orientation: 'horizontal' | 'vertical'
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
})

const emit = defineEmits<{
  resize: [deltaPx: number]
  reset: []
}>()

// ─── 键盘支持 ──────────────────────────────────────────────────────────────────

const KEYBOARD_STEP = 10

function onKeyDown(event: KeyboardEvent): void {
  if (props.disabled) return
  const isH = props.orientation === 'horizontal'
  if (isH && event.key === 'ArrowLeft') {
    event.preventDefault()
    emit('resize', -KEYBOARD_STEP)
  } else if (isH && event.key === 'ArrowRight') {
    event.preventDefault()
    emit('resize', KEYBOARD_STEP)
  } else if (!isH && event.key === 'ArrowUp') {
    event.preventDefault()
    emit('resize', -KEYBOARD_STEP)
  } else if (!isH && event.key === 'ArrowDown') {
    event.preventDefault()
    emit('resize', KEYBOARD_STEP)
  }
}

const dragging = ref(false)

// ─── Pointer 事件 ─────────────────────────────────────────────────────────────

let startX = 0
let startY = 0

function startDrag(event: PointerEvent | TouchEvent): void {
  if (props.disabled) return

  const isTouch = event instanceof TouchEvent
  startX = isTouch ? event.touches[0].clientX : (event as PointerEvent).clientX
  startY = isTouch ? event.touches[0].clientY : (event as PointerEvent).clientY

  dragging.value = true

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', stopDrag)
  window.addEventListener('touchmove', onTouchMove, { passive: false })
  window.addEventListener('touchend', stopDrag)
}

function onMove(event: PointerEvent): void {
  if (!dragging.value) return
  event.preventDefault()

  const delta =
    props.orientation === 'horizontal'
      ? event.clientX - startX
      : event.clientY - startY

  if (delta !== 0) {
    emit('resize', delta)
    // 重置起点：下次 move 时以当前位置为基准
    startX = event.clientX
    startY = event.clientY
  }
}

function onTouchMove(event: TouchEvent): void {
  if (!dragging.value) return
  event.preventDefault()

  const delta =
    props.orientation === 'horizontal'
      ? event.touches[0].clientX - startX
      : event.touches[0].clientY - startY

  if (delta !== 0) {
    emit('resize', delta)
    startX = event.touches[0].clientX
    startY = event.touches[0].clientY
  }
}

function stopDrag(): void {
  dragging.value = false
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', stopDrag)
  window.removeEventListener('touchmove', onTouchMove)
  window.removeEventListener('touchend', stopDrag)
}

function onDblClick(): void {
  emit('reset')
}
</script>

<template>
  <div
    class="resize-sash"
    :class="{
      'resize-sash--horizontal': orientation === 'horizontal',
      'resize-sash--vertical': orientation === 'vertical',
      'resize-sash--dragging': dragging,
      'resize-sash--disabled': disabled,
    }"
    role="separator"
    :aria-orientation="orientation === 'horizontal' ? 'vertical' : 'horizontal'"
    :aria-disabled="disabled"
    aria-label="调整面板大小"
    tabindex="0"
    @pointerdown.prevent="startDrag"
    @touchstart.prevent="startDrag"
    @dblclick="onDblClick"
    @keydown="onKeyDown"
  />
</template>

<style scoped>
.resize-sash {
  position: relative;
  z-index: 10;
  flex-shrink: 0;
  background: transparent;
  transition: background 0.1s;
  user-select: none;
  touch-action: none;
}

/* 扩展命中区域到 8px */
.resize-sash::before {
  content: '';
  position: absolute;
  inset: -4px;
}

/* 水平布局 → 垂直 sash (拖拽方向: 左右) */
.resize-sash--horizontal {
  width: 4px;
  height: 100%;
  cursor: col-resize;
}

/* 垂直布局 → 水平 sash (拖拽方向: 上下) */
.resize-sash--vertical {
  height: 4px;
  width: 100%;
  cursor: row-resize;
}

.resize-sash--dragging {
  background: var(--q-primary, var(--accent, #1976d2));
}

.resize-sash--disabled {
  cursor: default;
  pointer-events: none;
}

/* hover 时微弱高亮 */
.resize-sash:not(.resize-sash--disabled):hover {
  background: color-mix(in srgb, var(--q-primary, #1976d2) 40%, transparent);
}
</style>
