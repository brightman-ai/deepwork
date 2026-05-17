<script setup lang="ts">
/**
 * SlotTabBar — VS Code 风格的标签栏组件
 *
 * 纯展示组件，不持有业务状态。父组件负责 tabs/activeTabId 数据。
 *
 * - scroll 模式: 水平滚动 + 左右箭头按钮（仅溢出时显示）
 * - dropdown 模式: "..." 按钮展开全部标签的下拉列表
 * - 拖拽: pointerdown + 5px 阈值触发 tab-dragstart
 * - pinned tab 不显示关闭按钮；dirty tab 显示小圆点
 */

import { ref, onMounted, onBeforeUnmount, nextTick, watch, type Component } from 'vue'
import {
  X,
  Pin,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
} from 'lucide-vue-next'
import type { Tab } from '@ce/composables/layout/slotGrid/types'

// ─── Props / Emits ────────────────────────────────────────────────────────────

interface Props {
  tabs: Tab[]
  activeTabId: string | null
  tabBarVisible?: boolean
  overflow?: 'scroll' | 'dropdown'
}

const props = withDefaults(defineProps<Props>(), {
  tabBarVisible: true,
  overflow: 'scroll',
})

const emit = defineEmits<{
  'tab-activate': [tabId: string]
  'tab-close': [tabId: string]
  'tab-dragstart': [tabId: string, event: PointerEvent]
}>()

// ─── 滚动溢出控制 ─────────────────────────────────────────────────────────────

const scrollEl = ref<HTMLElement | null>(null)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)

function updateScrollState(): void {
  const el = scrollEl.value
  if (!el) return
  canScrollLeft.value = el.scrollLeft > 0
  canScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
}

function scrollLeft(): void {
  scrollEl.value?.scrollBy({ left: -120, behavior: 'smooth' })
}

function scrollRight(): void {
  scrollEl.value?.scrollBy({ left: 120, behavior: 'smooth' })
}

// activeTabId 变化时自动将对应 tab 滚动入视野
watch(
  () => props.activeTabId,
  async (id) => {
    if (props.overflow !== 'scroll' || !id) return
    await nextTick()
    const el = scrollEl.value
    if (!el) return
    const tabEl = el.querySelector<HTMLElement>(`[data-tab-id="${id}"]`)
    tabEl?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  },
)

// tabs 数量变化时刷新溢出状态
watch(() => props.tabs.length, () => nextTick(updateScrollState))

onMounted(() => {
  updateScrollState()
  scrollEl.value?.addEventListener('scroll', updateScrollState, { passive: true })
  window.addEventListener('resize', updateScrollState)
})

onBeforeUnmount(() => {
  scrollEl.value?.removeEventListener('scroll', updateScrollState)
  window.removeEventListener('resize', updateScrollState)
})

// ─── Dropdown 控制 ────────────────────────────────────────────────────────────

const dropdownOpen = ref(false)

function toggleDropdown(): void {
  dropdownOpen.value = !dropdownOpen.value
}

function closeDropdown(): void {
  dropdownOpen.value = false
}

// 点击 dropdown 外部时关闭
function onDropdownOutside(event: MouseEvent): void {
  const target = event.target as Node
  const el = dropdownTriggerEl.value
  const menu = dropdownMenuEl.value
  if (el && !el.contains(target) && menu && !menu.contains(target)) {
    closeDropdown()
  }
}

const dropdownTriggerEl = ref<HTMLElement | null>(null)
const dropdownMenuEl = ref<HTMLElement | null>(null)

watch(dropdownOpen, (open) => {
  if (open) {
    window.addEventListener('mousedown', onDropdownOutside, { capture: true })
  } else {
    window.removeEventListener('mousedown', onDropdownOutside, { capture: true })
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', onDropdownOutside, { capture: true })
})

function activateFromDropdown(tabId: string): void {
  emit('tab-activate', tabId)
  closeDropdown()
}

// ─── Tab 点击与拖拽 ───────────────────────────────────────────────────────────

// 每个正在追踪 pointer 的 tab 的状态
interface DragTrack {
  startX: number
  startY: number
  moved: boolean
}

const dragTrackers = new Map<string, DragTrack>()

function onTabPointerDown(tabId: string, tab: Tab, event: PointerEvent): void {
  // pinned tab 不触发拖拽
  if (tab.pinned) {
    emit('tab-activate', tabId)
    return
  }

  event.currentTarget && (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  dragTrackers.set(tabId, { startX: event.clientX, startY: event.clientY, moved: false })
}

function onTabPointerMove(tabId: string, event: PointerEvent): void {
  const tracker = dragTrackers.get(tabId)
  if (!tracker || tracker.moved) return

  const dx = event.clientX - tracker.startX
  const dy = event.clientY - tracker.startY
  const dist = Math.sqrt(dx * dx + dy * dy)

  if (dist >= 5) {
    tracker.moved = true
    dragTrackers.delete(tabId)
    // Bug C4 修复: 释放指针捕获，否则 DropZoneOverlay 的 pointerup 永远收不到事件
    const target = event.currentTarget as HTMLElement | null
    if (target && target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId)
    }
    emit('tab-dragstart', tabId, event)
  }
}

function onTabPointerUp(tabId: string, _event: PointerEvent): void {
  const tracker = dragTrackers.get(tabId)
  dragTrackers.delete(tabId)

  // 未超过阈值 → 视为点击
  if (tracker && !tracker.moved) {
    emit('tab-activate', tabId)
  }
}

function onTabPointerCancel(tabId: string): void {
  dragTrackers.delete(tabId)
}

function onCloseClick(tabId: string, event: MouseEvent): void {
  event.stopPropagation()
  emit('tab-close', tabId)
}

// ─── 工具 ─────────────────────────────────────────────────────────────────────

// 安全地将 tab.icon 转为 Component（避免 TS 类型问题）
function tabIcon(tab: Tab): Component | null {
  return tab.icon ? (tab.icon as Component) : null
}

</script>

<template>
  <!-- tabBarVisible=false 时完全不渲染 -->
  <div v-if="tabBarVisible" class="slot-tab-bar" :class="`slot-tab-bar--${overflow}`">

    <!-- ── scroll 模式 ────────────────────────────────────────────────────── -->
    <template v-if="overflow === 'scroll'">
      <!-- 左箭头 -->
      <button
        v-show="canScrollLeft"
        class="tab-scroll-btn tab-scroll-btn--left"
        tabindex="-1"
        aria-label="向左滚动标签"
        @click="scrollLeft"
      >
        <ChevronLeft :size="14" />
      </button>

      <!-- 标签滚动容器 -->
      <div ref="scrollEl" class="tab-list tab-list--scroll" role="tablist" aria-label="标签页">
        <template v-for="tab in tabs" :key="tab.id">
          <div
            class="tab-item"
            :class="{
              'tab-item--active': tab.id === activeTabId,
              'tab-item--pinned': tab.pinned,
              'tab-item--dirty': tab.dirty,
            }"
            :data-tab-id="tab.id"
            role="tab"
            :aria-selected="tab.id === activeTabId"
            :tabindex="tab.id === activeTabId ? 0 : -1"
            :title="tab.tooltip ?? tab.label"
            @pointerdown="onTabPointerDown(tab.id, tab, $event)"
            @pointermove="onTabPointerMove(tab.id, $event)"
            @pointerup="onTabPointerUp(tab.id, $event)"
            @pointercancel="onTabPointerCancel(tab.id)"
          >
            <!-- 图标 -->
            <component :is="tabIcon(tab)" v-if="tab.icon" class="tab-icon" :size="14" />

            <!-- 标签文字 -->
            <span class="tab-label">{{ tab.label }}</span>

            <!-- dirty 指示点 (优先于关闭按钮显示) -->
            <span v-if="tab.dirty && (tab.pinned || !tab.closable)" class="tab-dirty-dot" aria-label="未保存" />

            <!-- pin 图标 -->
            <Pin v-if="tab.pinned" class="tab-pin-icon" :size="11" />

            <!-- 关闭按钮 (可关闭且未 pinned) -->
            <button
              v-if="tab.closable && !tab.pinned"
              class="tab-close-btn"
              :class="{ 'tab-close-btn--dirty': tab.dirty }"
              tabindex="-1"
              aria-label="关闭标签"
              @click="onCloseClick(tab.id, $event)"
            >
              <!-- dirty 时关闭按钮内显示圆点，hover 变 X -->
              <span v-if="tab.dirty" class="tab-dirty-dot tab-dirty-dot--in-btn" />
              <X :size="12" />
            </button>
          </div>
        </template>
      </div>

      <!-- 右箭头 -->
      <button
        v-show="canScrollRight"
        class="tab-scroll-btn tab-scroll-btn--right"
        tabindex="-1"
        aria-label="向右滚动标签"
        @click="scrollRight"
      >
        <ChevronRight :size="14" />
      </button>
    </template>

    <!-- ── dropdown 模式 ─────────────────────────────────────────────────── -->
    <template v-else>
      <!-- 标签列表 (不可滚动，仅显示全部) -->
      <div class="tab-list tab-list--dropdown" role="tablist" aria-label="标签页">
        <template v-for="tab in tabs" :key="tab.id">
          <div
            class="tab-item"
            :class="{
              'tab-item--active': tab.id === activeTabId,
              'tab-item--pinned': tab.pinned,
              'tab-item--dirty': tab.dirty,
            }"
            :data-tab-id="tab.id"
            role="tab"
            :aria-selected="tab.id === activeTabId"
            :tabindex="tab.id === activeTabId ? 0 : -1"
            :title="tab.tooltip ?? tab.label"
            @pointerdown="onTabPointerDown(tab.id, tab, $event)"
            @pointermove="onTabPointerMove(tab.id, $event)"
            @pointerup="onTabPointerUp(tab.id, $event)"
            @pointercancel="onTabPointerCancel(tab.id)"
          >
            <component :is="tabIcon(tab)" v-if="tab.icon" class="tab-icon" :size="14" />
            <span class="tab-label">{{ tab.label }}</span>
            <span v-if="tab.dirty && (tab.pinned || !tab.closable)" class="tab-dirty-dot" aria-label="未保存" />
            <Pin v-if="tab.pinned" class="tab-pin-icon" :size="11" />
            <button
              v-if="tab.closable && !tab.pinned"
              class="tab-close-btn"
              :class="{ 'tab-close-btn--dirty': tab.dirty }"
              tabindex="-1"
              aria-label="关闭标签"
              @click="onCloseClick(tab.id, $event)"
            >
              <span v-if="tab.dirty" class="tab-dirty-dot tab-dirty-dot--in-btn" />
              <X :size="12" />
            </button>
          </div>
        </template>
      </div>

      <!-- "..." 触发按钮 -->
      <button
        ref="dropdownTriggerEl"
        class="tab-more-btn"
        :class="{ 'tab-more-btn--open': dropdownOpen }"
        tabindex="-1"
        aria-label="所有标签"
        :aria-expanded="dropdownOpen"
        @click="toggleDropdown"
      >
        <MoreHorizontal :size="14" />
      </button>

      <!-- 下拉菜单 -->
      <div
        v-if="dropdownOpen"
        ref="dropdownMenuEl"
        class="tab-dropdown-menu"
        role="listbox"
        aria-label="标签列表"
      >
        <div
          v-for="tab in tabs"
          :key="tab.id"
          class="tab-dropdown-item"
          :class="{ 'tab-dropdown-item--active': tab.id === activeTabId }"
          role="option"
          :aria-selected="tab.id === activeTabId"
          @mousedown.prevent="activateFromDropdown(tab.id)"
        >
          <component :is="tabIcon(tab)" v-if="tab.icon" :size="13" class="tab-icon" />
          <span class="tab-label">{{ tab.label }}</span>
          <span v-if="tab.dirty" class="tab-dirty-dot" />
        </div>
      </div>
    </template>

  </div>
</template>

<style scoped>
/* ── 根容器 ──────────────────────────────────────────────────────────────────── */
.slot-tab-bar {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  height: 32px;
  background: hsl(var(--muted) / 0.3);
  border-bottom: 1px solid var(--border);
  overflow: hidden;
  user-select: none;
  flex-shrink: 0;
}

/* ── 标签列表容器 ─────────────────────────────────────────────────────────────── */
.tab-list {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  flex: 1;
  min-width: 0;
}

/* scroll 模式: 横向滚动，隐藏滚动条 */
.tab-list--scroll {
  overflow-x: auto;
  overflow-y: hidden;
  scroll-behavior: smooth;
  scrollbar-width: none;
}
.tab-list--scroll::-webkit-scrollbar {
  display: none;
}

/* dropdown 模式: 截断超出部分 */
.tab-list--dropdown {
  overflow: hidden;
}

/* ── 单个 Tab ─────────────────────────────────────────────────────────────────── */
.tab-item {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  padding: 0 10px;
  min-width: 80px;
  max-width: 200px;
  height: 100%;
  cursor: pointer;
  color: var(--muted-foreground);
  font-size: 12px;
  white-space: nowrap;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  transition: background 0.12s, color 0.12s;
  box-sizing: border-box;
}

.tab-item:hover {
  background: hsl(var(--muted) / 0.6);
  color: var(--foreground);
}

/* 激活 tab: 亮背景 + 底部 primary 色线 */
.tab-item--active {
  background: hsl(var(--background, 0 0% 100%) / 1);
  color: var(--foreground);
  font-weight: 500;
}

.tab-item--active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: hsl(var(--primary));
}

/* ── Tab 内部元素 ─────────────────────────────────────────────────────────────── */
.tab-icon {
  flex-shrink: 0;
  opacity: 0.75;
}

.tab-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-pin-icon {
  flex-shrink: 0;
  opacity: 0.5;
}

/* dirty 指示小圆点 */
.tab-dirty-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: hsl(var(--primary));
  flex-shrink: 0;
}

/* 关闭按钮内的 dirty dot — hover 时被 X 图标覆盖 */
.tab-close-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 3px;
  color: var(--muted-foreground);
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}

.tab-close-btn:hover {
  background: hsl(var(--muted) / 0.8);
  color: var(--foreground);
}

/* dirty 状态: 默认显示圆点，hover 显示 X */
.tab-close-btn--dirty .tab-dirty-dot--in-btn {
  position: absolute;
}
.tab-close-btn--dirty > svg {
  opacity: 0;
  transition: opacity 0.1s;
}
.tab-close-btn--dirty:hover > svg {
  opacity: 1;
}
.tab-close-btn--dirty:hover .tab-dirty-dot--in-btn {
  display: none;
}

/* ── 滚动箭头按钮 ─────────────────────────────────────────────────────────────── */
.tab-scroll-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 100%;
  flex-shrink: 0;
  padding: 0;
  border: none;
  background: hsl(var(--muted) / 0.3);
  color: var(--muted-foreground);
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}

.tab-scroll-btn:hover {
  background: hsl(var(--muted) / 0.7);
  color: var(--foreground);
}

.tab-scroll-btn--left {
  border-right: 1px solid var(--border);
}
.tab-scroll-btn--right {
  border-left: 1px solid var(--border);
}

/* ── Dropdown "..." 按钮 ─────────────────────────────────────────────────────── */
.tab-more-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 100%;
  flex-shrink: 0;
  padding: 0;
  border: none;
  border-left: 1px solid var(--border);
  background: hsl(var(--muted) / 0.3);
  color: var(--muted-foreground);
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}

.tab-more-btn:hover,
.tab-more-btn--open {
  background: hsl(var(--muted) / 0.7);
  color: var(--foreground);
}

/* ── 下拉菜单 ────────────────────────────────────────────────────────────────── */
.tab-dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 100;
  min-width: 200px;
  max-width: 320px;
  max-height: 320px;
  overflow-y: auto;
  background: hsl(var(--popover, var(--background)));
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 4px 16px hsl(0 0% 0% / 0.15);
  padding: 4px;
}

.tab-dropdown-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--muted-foreground);
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
  white-space: nowrap;
  overflow: hidden;
}

.tab-dropdown-item:hover {
  background: hsl(var(--muted) / 0.6);
  color: var(--foreground);
}

.tab-dropdown-item--active {
  background: hsl(var(--muted) / 0.4);
  color: var(--foreground);
  font-weight: 500;
}

.tab-dropdown-item .tab-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
