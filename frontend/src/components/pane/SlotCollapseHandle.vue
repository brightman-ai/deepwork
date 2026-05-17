<script setup lang="ts">
/**
 * SlotCollapseHandle — leaf 面板折叠手柄
 *
 * 展开状态: 在 sash 边缘显示一个小 chevron 按钮
 * 折叠状态: 整个组件变为窄条，显示角色图标 + 旋转标签
 *
 * 仅负责显示与交互，业务逻辑通过 emit('toggle') 上报
 */

import { computed } from 'vue'
import {
  Layout,
  PanelRight,
  Sidebar,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
} from 'lucide-vue-next'
import type { SlotRole } from '@ce/composables/layout/types'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  leafId: string
  role: SlotRole
  label: string
  collapsed: boolean
  orientation: 'horizontal' | 'vertical'
  /** 此 leaf 在 sash 的哪侧：before = 左/上，after = 右/下 */
  position: 'before' | 'after'
}

const props = defineProps<Props>()

// ─── Emits ────────────────────────────────────────────────────────────────────

const emit = defineEmits<{
  toggle: [leafId: string]
}>()

// ─── 角色图标映射 ──────────────────────────────────────────────────────────────

const roleIconMap = {
  primary: Layout,
  secondary: PanelRight,
  navigator: Sidebar,
  companion: MessageSquare,
} as const

const roleIcon = computed(() => roleIconMap[props.role])

// ─── Chevron 方向计算 ──────────────────────────────────────────────────────────
//
// 展开时，chevron 指向折叠方向（即 sash 所在的一侧）
//   horizontal + before → 折叠向左 → ChevronLeft
//   horizontal + after  → 折叠向右 → ChevronRight
//   vertical   + before → 折叠向上 → ChevronUp
//   vertical   + after  → 折叠向下 → ChevronDown
//
// 折叠时，chevron 反向指示"可展开"方向

const expandedChevron = computed(() => {
  if (props.orientation === 'horizontal') {
    return props.position === 'before' ? ChevronLeft : ChevronRight
  }
  return props.position === 'before' ? ChevronUp : ChevronDown
})

const collapsedChevron = computed(() => {
  if (props.orientation === 'horizontal') {
    return props.position === 'before' ? ChevronRight : ChevronLeft
  }
  return props.position === 'before' ? ChevronDown : ChevronUp
})

// ─── CSS 类 ───────────────────────────────────────────────────────────────────

// sash 边缘位置：决定 chevron 按钮贴哪条边
const edgeClass = computed(() => {
  if (props.orientation === 'horizontal') {
    return props.position === 'before' ? 'edge--right' : 'edge--left'
  }
  return props.position === 'before' ? 'edge--bottom' : 'edge--top'
})

// ─── 交互 ──────────────────────────────────────────────────────────────────────

function handleToggle(): void {
  emit('toggle', props.leafId)
}
</script>

<template>
  <!-- 折叠状态：整条可点击窄条 -->
  <div
    v-if="collapsed"
    class="collapse-strip"
    :class="`strip--${orientation}`"
    role="button"
    :aria-label="`展开 ${label}`"
    aria-expanded="false"
    tabindex="0"
    @click="handleToggle"
    @keydown.enter.space.prevent="handleToggle"
  >
    <!-- 角色图标 -->
    <component :is="roleIcon" class="strip-icon" :size="16" />

    <!-- 标签文字（水平布局时旋转） -->
    <span class="strip-label" :class="{ 'strip-label--rotated': orientation === 'horizontal' }">
      {{ label }}
    </span>

    <!-- 展开方向指示箭头 -->
    <component :is="collapsedChevron" class="strip-chevron" :size="12" />
  </div>

  <!-- 展开状态：仅在 sash 边缘显示一个小按钮 -->
  <button
    v-else
    class="collapse-btn"
    :class="edgeClass"
    type="button"
    :aria-label="`折叠 ${label}`"
    aria-expanded="true"
    @click="handleToggle"
  >
    <component :is="expandedChevron" :size="12" />
  </button>
</template>

<style scoped>
/* ─── 折叠窄条 ─────────────────────────────────────────────────────────────── */

.collapse-strip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: hsl(var(--muted));
  cursor: pointer;
  user-select: none;
  transition:
    background 200ms ease,
    opacity 200ms ease;
  overflow: hidden;
}

.collapse-strip:hover {
  background: hsl(var(--muted) / 0.8);
  filter: brightness(1.12);
}

/* 水平布局 → 垂直窄条（左右折叠） */
.collapse-strip.strip--horizontal {
  flex-direction: column;
  width: 28px;
  height: 100%;
  border-right: 1px solid hsl(var(--border));
  border-left: 1px solid hsl(var(--border));
}

/* 垂直布局 → 水平窄条（上下折叠） */
.collapse-strip.strip--vertical {
  flex-direction: row;
  height: 28px;
  width: 100%;
  border-top: 1px solid hsl(var(--border));
  border-bottom: 1px solid hsl(var(--border));
}

/* ─── 窄条内容 ─────────────────────────────────────────────────────────────── */

.strip-icon {
  color: hsl(var(--muted-foreground));
  flex-shrink: 0;
}

.strip-label {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
  line-height: 1;
}

/* 水平布局时标签竖排 */
.strip-label--rotated {
  writing-mode: vertical-rl;
  text-orientation: mixed;
}

.strip-chevron {
  color: hsl(var(--muted-foreground) / 0.6);
  flex-shrink: 0;
}

/* ─── 展开状态：边缘 chevron 按钮 ────────────────────────────────────────── */

.collapse-btn {
  position: absolute;
  z-index: 5;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  opacity: 0;
  padding: 0;
  transition:
    opacity 200ms ease,
    background 200ms ease;
}

/* 父级 hover 时显示按钮；也可由父组件控制 visibility */
:global(.slot-grid__cell:hover) .collapse-btn,
.collapse-btn:focus-visible {
  opacity: 1;
}

.collapse-btn:hover {
  background: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
  opacity: 1;
}

/* ─── 边缘定位（垂直居中，贴近 sash 的那条边） ──────────────────────────── */

/* 水平布局 sash 在右侧 → 按钮贴右边，垂直居中 */
.collapse-btn.edge--right {
  right: 0;
  top: 50%;
  transform: translate(50%, -50%);
}

/* 水平布局 sash 在左侧 → 按钮贴左边，垂直居中 */
.collapse-btn.edge--left {
  left: 0;
  top: 50%;
  transform: translate(-50%, -50%);
}

/* 垂直布局 sash 在下侧 → 按钮贴下边，水平居中 */
.collapse-btn.edge--bottom {
  bottom: 0;
  left: 50%;
  transform: translate(-50%, 50%);
}

/* 垂直布局 sash 在上侧 → 按钮贴上边，水平居中 */
.collapse-btn.edge--top {
  top: 0;
  left: 50%;
  transform: translate(-50%, -50%);
}
</style>
