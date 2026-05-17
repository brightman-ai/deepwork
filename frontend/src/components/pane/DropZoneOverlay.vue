<script setup lang="ts">
/**
 * DropZoneOverlay — 拖拽落点选区覆盖层
 *
 * 覆盖整个 leaf 单元格，展示 5 个可落区域 (center / left / right / top / bottom)。
 * 由父组件控制 active 状态；内部仅处理指针事件并向外发射语义事件。
 *
 * 区域划分 (中心 50%，四边各 25%):
 *   ┌──────────────────┐
 *   │      top 25%     │
 *   ├────┬────────┬────┤
 *   │left│ center │right│ 各 25% / 50% / 25%
 *   ├────┴────────┴────┤
 *   │     bottom 25%   │
 *   └──────────────────┘
 */

import { computed } from 'vue'
import type { DropTarget } from '@ce/composables/layout/slotGrid/types'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  /** 拖拽进行中 — 控制覆盖层可见性 */
  active: boolean
  /** 所属 leaf 的 ID */
  leafId: string
  /** 当前高亮区域，null 表示无高亮 */
  highlightedZone: DropTarget['position'] | null
}

const props = defineProps<Props>()

// ─── Emits ────────────────────────────────────────────────────────────────────

const emit = defineEmits<{
  /** 指针抬起，触发落点 */
  drop: [target: DropTarget]
}>()

// ─── 区域配置 ──────────────────────────────────────────────────────────────────

type ZonePosition = DropTarget['position']

// ─── 区域命中计算 ──────────────────────────────────────────────────────────────

/**
 * 根据指针在覆盖层内的相对坐标，计算命中哪个区域。
 * 边 25% → 对应方向区域；内部 50%×50% → center。
 */
function hitZone(event: PointerEvent): ZonePosition {
  const el = event.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  const rx = (event.clientX - rect.left) / rect.width   // 0-1
  const ry = (event.clientY - rect.top)  / rect.height  // 0-1

  if (ry < 0.25) return 'top'
  if (ry > 0.75) return 'bottom'
  if (rx < 0.25) return 'left'
  if (rx > 0.75) return 'right'
  return 'center'
}

// ─── 指针事件处理 ──────────────────────────────────────────────────────────────

function onPointerUp(event: PointerEvent): void {
  const zone = hitZone(event)
  emit('drop', { leafId: props.leafId, position: zone })
}

// ─── 高亮区域计算属性 ──────────────────────────────────────────────────────────

/** 每个区域是否处于高亮状态 */
function isHighlighted(position: ZonePosition): boolean {
  return props.highlightedZone === position
}

/** center 区域显示标签 */
const centerLabel = computed(() =>
  props.highlightedZone === 'center' ? '移入标签组' : ''
)
</script>

<template>
  <!-- 覆盖整个 leaf，active 时捕获指针事件 -->
  <div
    v-if="active"
    class="drop-zone-overlay"
    @pointerup.prevent="onPointerUp"
  >
    <!-- 上区域 -->
    <div
      class="drop-zone drop-zone--top"
      :class="{ 'drop-zone--highlighted': isHighlighted('top') }"
    >
      <span v-if="isHighlighted('top')" class="drop-zone__arrow">↑</span>
    </div>

    <!-- 下区域 -->
    <div
      class="drop-zone drop-zone--bottom"
      :class="{ 'drop-zone--highlighted': isHighlighted('bottom') }"
    >
      <span v-if="isHighlighted('bottom')" class="drop-zone__arrow">↓</span>
    </div>

    <!-- 左区域 -->
    <div
      class="drop-zone drop-zone--left"
      :class="{ 'drop-zone--highlighted': isHighlighted('left') }"
    >
      <span v-if="isHighlighted('left')" class="drop-zone__arrow">←</span>
    </div>

    <!-- 右区域 -->
    <div
      class="drop-zone drop-zone--right"
      :class="{ 'drop-zone--highlighted': isHighlighted('right') }"
    >
      <span v-if="isHighlighted('right')" class="drop-zone__arrow">→</span>
    </div>

    <!-- 中心区域 -->
    <div
      class="drop-zone drop-zone--center"
      :class="{ 'drop-zone--highlighted': isHighlighted('center') }"
    >
      <span v-if="isHighlighted('center')" class="drop-zone__label">{{ centerLabel }}</span>
    </div>
  </div>
</template>

<style scoped>
/* ─── 覆盖层容器 ──────────────────────────────────────────────────────────────── */

.drop-zone-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  pointer-events: auto;
  /* 防止选中文本 */
  user-select: none;
}

/* ─── 区域基础样式 ────────────────────────────────────────────────────────────── */

.drop-zone {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 默认：仅轮廓，无填充 */
  background: transparent;
  border: 1.5px dashed color-mix(in srgb, var(--q-primary, #1976d2) 35%, transparent);
  box-sizing: border-box;
  transition:
    background 150ms ease,
    border-color 150ms ease;
}

/* ─── 5 区域定位 ──────────────────────────────────────────────────────────────── */

/* 上：顶部 25% 全宽 */
.drop-zone--top {
  inset: 0 0 75% 0;
}

/* 下：底部 25% 全宽 */
.drop-zone--bottom {
  inset: 75% 0 0 0;
}

/* 左：左侧 25%，中间 50% 高度段 */
.drop-zone--left {
  inset: 25% 75% 25% 0;
}

/* 右：右侧 25%，中间 50% 高度段 */
.drop-zone--right {
  inset: 25% 0 25% 75%;
}

/* 中心：内缩 25% 四边 */
.drop-zone--center {
  inset: 25% 25% 25% 25%;
}

/* ─── 高亮状态 ────────────────────────────────────────────────────────────────── */

.drop-zone--highlighted {
  background: hsl(var(--primary) / 0.15);
  /* 回退：Quasar 主色带透明度 */
  background: color-mix(in srgb, var(--q-primary, #1976d2) 15%, transparent);
  border: 2px solid var(--q-primary, #1976d2);
}

/* ─── 区域内容 ────────────────────────────────────────────────────────────────── */

.drop-zone__arrow {
  font-size: 1.25rem;
  line-height: 1;
  color: var(--q-primary, #1976d2);
  pointer-events: none;
}

.drop-zone__label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--q-primary, #1976d2);
  white-space: nowrap;
  pointer-events: none;
}
</style>
