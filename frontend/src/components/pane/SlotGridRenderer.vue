<script setup lang="ts">
/**
 * SlotGridRenderer — 递归渲染 SlotGrid 树
 *
 * 根据 SlotGrid 数据结构渲染嵌套的 grid 容器，
 * 并在相邻 leaf 之间插入 ResizeSash。
 *
 * 每个 leaf 通过具名 slot 暴露给父组件:
 *   <template #slot-id="{ role, collapsed, activeTabId }">
 *     <YourPaneComponent ... />
 *   </template>
 *
 * 递归 branch 由内部 SlotBranchRenderer 子组件处理。
 *
 * 参考: DPF-FINAL-SPEC 附录 E §E.7 + 任务规范
 */

import { computed, ref, provide, onMounted, onUnmounted } from 'vue'
import type { CSSProperties } from 'vue'
import ResizeSash from './ResizeSash.vue'
import SlotTabBar from './SlotTabBar.vue'
import DropZoneOverlay from './DropZoneOverlay.vue'
import SlotCollapseHandle from './SlotCollapseHandle.vue'
import PaneErrorBoundary from './PaneErrorBoundary.vue'
import type { SlotGrid, SlotNode, SlotLeaf, SlotBranch, DragPayload, DropTarget } from '../../composables/layout/slotGrid/types'
import { buildGridCSS, buildBranchCSS } from '../../composables/layout/slotGrid/buildGridCSS'
import { useSlotDnd, SLOT_DND_KEY } from '../../composables/layout/slotGrid/slotDnd'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  grid: SlotGrid
  collapsedSlots?: Set<string>
  /** 容器像素宽度，用于 resize delta 换算 */
  containerWidth?: number
  containerHeight?: number
  /** 是否启用 DnD（默认开启）*/
  dndEnabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  collapsedSlots: () => new Set<string>(),
  containerWidth: 0,
  containerHeight: 0,
  dndEnabled: true,
})

const emit = defineEmits<{
  /** 用户拖拽 sash 后触发，父组件应更新 grid.sizes */
  resize: [parentPath: number[], index: number, deltaPx: number]
  /** 双击 sash 重置 */
  resizeReset: [parentPath: number[], index: number]
  /** tab 激活 */
  'tab-activate': [leafId: string, tabId: string]
  /** tab 关闭 */
  'tab-close': [leafId: string, tabId: string]
  /** tab 拖拽开始（内部消费，同时上报父组件） */
  'tab-dragstart': [leafId: string, tabId: string, event: PointerEvent]
  /**
   * 落点事件：payload 为被拖拽 tab 信息，target 为落点 leaf + 位置。
   * 父组件负责调用 useSlotGrid.moveTab() 或 splitLeaf()。
   */
  drop: [payload: DragPayload, target: DropTarget]
  /** 折叠/展开切换 */
  collapse: [leafId: string]
}>()

// ─── DnD 状态机 ───────────────────────────────────────────────────────────────

const dnd = useSlotDnd()
provide(SLOT_DND_KEY, dnd)

/** 根容器 ref，用于收集 [data-leaf-id] 元素 */
const rootEl = ref<HTMLElement | null>(null)

/** 收集当前渲染树内所有 leaf 元素 Map<leafId, HTMLElement> */
function collectLeafElements(): Map<string, HTMLElement> {
  const map = new Map<string, HTMLElement>()
  if (!rootEl.value) return map
  rootEl.value.querySelectorAll<HTMLElement>('[data-leaf-id]').forEach((el) => {
    const id = el.dataset.leafId
    if (id) map.set(id, el)
  })
  return map
}

/** 全局 pointermove：更新 ghost + 计算落点 */
function onGlobalPointerMove(event: PointerEvent): void {
  if (!dnd.state.value || dnd.state.value.phase === 'idle') return
  dnd.updateDragWithTarget(event, collectLeafElements())
}

/** Escape 取消拖拽 */
function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') dnd.cancelDrag()
}

onMounted(() => {
  window.addEventListener('pointermove', onGlobalPointerMove)
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('pointermove', onGlobalPointerMove)
  window.removeEventListener('keydown', onKeyDown)
})

/**
 * 启动 tab 拖拽。由 SlotTabBar tab-dragstart 事件驱动（内部消费）。
 */
function handleTabDragStart(leafId: string, tabId: string, event: PointerEvent): void {
  emit('tab-dragstart', leafId, tabId, event)
  if (!props.dndEnabled) return
  dnd.startDrag({ type: 'tab', sourceLeafId: leafId, tabId }, event)
}

/**
 * DropZoneOverlay 的 drop 事件处理。
 * 取出 dnd 结果并向父组件上报，自身不调用 useSlotGrid。
 */
function handleDrop(overlayTarget: DropTarget): void {
  const result = dnd.endDrag()
  if (!result) return

  const { payload, target } = result
  const effectiveTarget = target ?? overlayTarget

  // 同 leaf + center → 无意义，忽略
  if (
    payload.sourceLeafId === effectiveTarget.leafId &&
    effectiveTarget.position === 'center'
  ) {
    return
  }

  emit('drop', payload, effectiveTarget)
}

/** 是否正在拖拽（驱动 DropZoneOverlay 可见性和 cursor class） */
const isDragging = computed(() => !!dnd.state.value && dnd.state.value.phase !== 'idle')

/** 返回指定 leaf 当前高亮的 zone（仅拖拽中有效）*/
function highlightedZone(leafId: string): DropTarget['position'] | null {
  const t = dnd.state.value?.target
  return t && t.leafId === leafId ? t.position : null
}

// ─── 根级 CSS ─────────────────────────────────────────────────────────────────

const rootStyle = computed<CSSProperties>(() =>
  buildGridCSS(props.grid, props.collapsedSlots) as CSSProperties
)

// ─── 扁平化根 children（含 sash 位置信息）─────────────────────────────────────

interface RenderItem {
  kind: 'leaf' | 'branch' | 'sash'
  node?: SlotNode
  sashIndex?: number // 紧接在此 index child 之后的 sash
  parentPath: number[]
  /** Stable key for Vue reconciliation (never use array index) */
  stableKey: string
}

const rootItems = computed<RenderItem[]>(() => {
  return buildItems(props.grid.children, [])
})

function buildItems(children: SlotNode[], parentPath: number[]): RenderItem[] {
  const pathPrefix = parentPath.length ? parentPath.join('-') + ':' : ''
  const items: RenderItem[] = []
  children.forEach((node, index) => {
    const nodeId = node.type === 'leaf' ? (node as SlotLeaf).id : `branch-${index}`
    items.push({
      kind: node.type,
      node,
      parentPath,
      stableKey: `${pathPrefix}${nodeId}`,
    })
    if (index < children.length - 1) {
      items.push({
        kind: 'sash',
        sashIndex: index,
        parentPath,
        stableKey: `${pathPrefix}sash-${index}`,
      })
    }
  })
  return items
}

// ─── Resize 处理 ──────────────────────────────────────────────────────────────

function handleResize(parentPath: number[], index: number, deltaPx: number): void {
  emit('resize', parentPath, index, deltaPx)
}

function handleResizeReset(parentPath: number[], index: number): void {
  emit('resizeReset', parentPath, index)
}

// ─── Sash orientation ─────────────────────────────────────────────────────────
// 水平 grid → 垂直 sash (col-resize)
// 垂直 grid → 水平 sash (row-resize)
const sashOrientation = computed(() => props.grid.orientation)

// ─── Tab bar 显示判断 ──────────────────────────────────────────────────────────
// tabs > 1 或 tabBarVisible === true 时显示标签栏
function shouldShowTabBar(leaf: SlotLeaf): boolean {
  const { tabs, tabBarVisible } = leaf.tabGroup
  return tabs.length > 1 || tabBarVisible === true
}

// ─── Collapse 判断 ─────────────────────────────────────────────────────────────
function isCollapsible(leaf: SlotLeaf): boolean {
  return leaf.constraints.collapsible === true
}

function isCollapsed(leaf: SlotLeaf): boolean {
  return props.collapsedSlots.has(leaf.id) || leaf.collapsed
}

/** 叶节点在父 grid 中的位置 (用于 CollapseHandle 方向) */
function leafPosition(leaf: SlotLeaf): 'before' | 'after' {
  const children = props.grid.children
  const idx = children.findIndex(n => n.type === 'leaf' && (n as SlotLeaf).id === leaf.id)
  return idx <= 0 ? 'before' : 'after'
}

function handleCollapse(leafId: string): void {
  emit('collapse', leafId)
}

// ─── ARIA 辅助 ────────────────────────────────────────────────────────────────

const roleLabels: Record<string, string> = {
  primary: '主面板',
  secondary: '次要面板',
  navigator: '导航面板',
  companion: '辅助面板',
}

function leafAriaLabel(leaf: SlotLeaf): string {
  return roleLabels[leaf.role] ?? `${leaf.role} 面板`
}

// ─── 面板级拖拽 (leaf drag handle) ────────────────────────────────────────────
// 多 leaf grid 中，每个 leaf 显示 grip handle，拖动可互换位置
const isMultiLeafGrid = computed(() => props.grid.children.length > 1)

let leafDragTrack: { leafId: string; startX: number; startY: number } | null = null
const LEAF_DRAG_THRESHOLD = 5

function handleLeafGripDown(leafId: string, event: PointerEvent): void {
  if (!props.dndEnabled) return
  leafDragTrack = { leafId, startX: event.clientX, startY: event.clientY }
  window.addEventListener('pointermove', onLeafGripMove)
  window.addEventListener('pointerup', onLeafGripUp)
}

function onLeafGripMove(event: PointerEvent): void {
  if (!leafDragTrack) return
  const dx = event.clientX - leafDragTrack.startX
  const dy = event.clientY - leafDragTrack.startY
  if (Math.sqrt(dx * dx + dy * dy) >= LEAF_DRAG_THRESHOLD) {
    // 超过阈值 → 发起面板级拖拽
    dnd.startDrag({ type: 'leaf', sourceLeafId: leafDragTrack.leafId }, event)
    cleanupLeafGrip()
  }
}

function onLeafGripUp(): void {
  cleanupLeafGrip()
}

function cleanupLeafGrip(): void {
  leafDragTrack = null
  window.removeEventListener('pointermove', onLeafGripMove)
  window.removeEventListener('pointerup', onLeafGripUp)
}
</script>

<template>
  <div
    ref="rootEl"
    class="slot-grid"
    :class="{ 'slot-grid--dragging': isDragging }"
    :style="rootStyle"
    role="main"
  >
    <template v-for="item in rootItems" :key="item.stableKey">
      <!-- Sash 分割线 -->
      <ResizeSash
        v-if="item.kind === 'sash'"
        :orientation="sashOrientation"
        @resize="(delta) => handleResize(item.parentPath, item.sashIndex!, delta)"
        @reset="handleResizeReset(item.parentPath, item.sashIndex!)"
      />

      <!-- Leaf 叶节点 -->
      <div
        v-else-if="item.kind === 'leaf'"
        :class="[
          'slot-grid__cell',
          {
            'slot-grid__cell--collapsed':
              collapsedSlots.has((item.node as SlotLeaf).id) || (item.node as SlotLeaf).collapsed,
            'slot-grid__cell--has-tabbar': shouldShowTabBar(item.node as SlotLeaf),
          },
        ]"
        :data-leaf-id="(item.node as SlotLeaf).id"
        role="region"
        :aria-label="leafAriaLabel(item.node as SlotLeaf)"
      >
        <!-- 有 tab bar 时: 垂直 flex 布局，tabbar 在上，内容在下 -->
        <template v-if="shouldShowTabBar(item.node as SlotLeaf)">
          <SlotTabBar
            :tabs="(item.node as SlotLeaf).tabGroup.tabs"
            :active-tab-id="(item.node as SlotLeaf).tabGroup.activeTabId"
            :tab-bar-visible="(item.node as SlotLeaf).tabGroup.tabBarVisible"
            :overflow="(item.node as SlotLeaf).tabGroup.overflow"
            @tab-activate="(tabId) => emit('tab-activate', (item.node as SlotLeaf).id, tabId)"
            @tab-close="(tabId) => emit('tab-close', (item.node as SlotLeaf).id, tabId)"
            @tab-dragstart="(tabId, ev) => handleTabDragStart((item.node as SlotLeaf).id, tabId, ev)"
          />
          <div class="slot-grid__cell-content">
            <PaneErrorBoundary>
              <slot
                :name="(item.node as SlotLeaf).id"
                :role="(item.node as SlotLeaf).role"
                :collapsed="
                  collapsedSlots.has((item.node as SlotLeaf).id) || (item.node as SlotLeaf).collapsed
                "
                :leaf="item.node as SlotLeaf"
                :active-tab-id="(item.node as SlotLeaf).tabGroup.activeTabId"
              />
            </PaneErrorBoundary>
          </div>
        </template>

        <!-- 折叠态: 显示 CollapseHandle 替代内容 -->
        <SlotCollapseHandle
          v-else-if="isCollapsible(item.node as SlotLeaf) && isCollapsed(item.node as SlotLeaf)"
          :leaf-id="(item.node as SlotLeaf).id"
          :role="(item.node as SlotLeaf).role"
          :label="(item.node as SlotLeaf).role"
          :collapsed="true"
          :orientation="grid.orientation"
          :position="leafPosition(item.node as SlotLeaf)"
          @toggle="handleCollapse"
        />

        <!-- 非折叠 + 无 tab bar: 直接渲染 slot，与旧行为完全一致 -->
        <template v-else>
          <PaneErrorBoundary>
            <slot
              :name="(item.node as SlotLeaf).id"
              :role="(item.node as SlotLeaf).role"
              :collapsed="false"
              :leaf="item.node as SlotLeaf"
              :active-tab-id="(item.node as SlotLeaf).tabGroup.activeTabId"
            />
          </PaneErrorBoundary>
          <!-- 可折叠 leaf 在展开态也显示折叠按钮 -->
          <SlotCollapseHandle
            v-if="isCollapsible(item.node as SlotLeaf)"
            :leaf-id="(item.node as SlotLeaf).id"
            :role="(item.node as SlotLeaf).role"
            :label="(item.node as SlotLeaf).role"
            :collapsed="false"
            :orientation="grid.orientation"
            :position="leafPosition(item.node as SlotLeaf)"
            @toggle="handleCollapse"
          />
        </template>

        <!-- 面板拖拽 grip (dndEnabled 时始终显示，单 leaf 也可拖出分割) -->
        <div
          v-if="dndEnabled && !isCollapsed(item.node as SlotLeaf)"
          class="slot-grid__leaf-grip"
          title="拖动交换面板位置"
          @pointerdown.prevent.stop="handleLeafGripDown((item.node as SlotLeaf).id, $event)"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" opacity="0.4">
            <circle cx="3" cy="3" r="1" /><circle cx="7" cy="3" r="1" />
            <circle cx="3" cy="7" r="1" /><circle cx="7" cy="7" r="1" />
          </svg>
        </div>

        <!-- 拖拽中叠加落区覆盖层 -->
        <DropZoneOverlay
          v-if="isDragging"
          :active="true"
          :leaf-id="(item.node as SlotLeaf).id"
          :highlighted-zone="highlightedZone((item.node as SlotLeaf).id)"
          @drop="handleDrop"
        />
      </div>

      <!-- Branch 递归子树 -->
      <SlotBranchRenderer
        v-else-if="item.kind === 'branch'"
        :branch="item.node as SlotBranch"
        :collapsed-slots="collapsedSlots"
        :parent-path="[...item.parentPath]"
        :is-dragging="isDragging"
        :dnd-target="dnd.state.value ? (dnd.state.value.target ?? null) : null"
        @resize="(path, idx, delta) => emit('resize', path, idx, delta)"
        @resize-reset="(path, idx) => emit('resizeReset', path, idx)"
        @tab-activate="(leafId, tabId) => emit('tab-activate', leafId, tabId)"
        @tab-close="(leafId, tabId) => emit('tab-close', leafId, tabId)"
        @tab-dragstart="(leafId, tabId, ev) => handleTabDragStart(leafId, tabId, ev)"
        @drop="handleDrop"
        @collapse="(leafId) => emit('collapse', leafId)"
        @leaf-grip-down="(leafId, ev) => handleLeafGripDown(leafId, ev)"
      >
        <!-- 透传所有 slots 到递归子组件 -->
        <template v-for="(_, name) in $slots" #[name]="slotProps">
          <slot :name="name" v-bind="slotProps ?? {}" />
        </template>
      </SlotBranchRenderer>
    </template>
  </div>
</template>

<style scoped>
.slot-grid {
  display: grid;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

/* Transition only for programmatic changes (collapse/expand/scenario switch).
   During drag, ResizeSash emits rapid deltas — transition would lag. */
.slot-grid:not(:has(.resize-sash--dragging)) {
  transition:
    grid-template-columns 0.2s ease,
    grid-template-rows 0.2s ease;
}

.slot-grid__cell {
  overflow: hidden;
  min-width: 0;
  min-height: 0;
  position: relative;
}

/* 有 tabbar 时切换为 flex 列布局 */
.slot-grid__cell--has-tabbar {
  display: flex;
  flex-direction: column;
}

.slot-grid__cell-content {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.slot-grid__cell--collapsed {
  overflow: hidden;
}

/* 面板拖拽 grip handle — 左上角，hover 时渐显 */
.slot-grid__leaf-grip {
  position: absolute;
  top: 4px;
  left: 4px;
  z-index: 5;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  cursor: grab;
  opacity: 0;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted) / 0.5);
  transition: opacity 0.15s;
}
.slot-grid__cell:hover > .slot-grid__leaf-grip {
  opacity: 1;
}
.slot-grid__leaf-grip:hover {
  opacity: 1 !important;
  background: hsl(var(--muted));
}
.slot-grid__leaf-grip:active {
  cursor: grabbing;
}

/* 拖拽中全局 cursor 覆盖 */
.slot-grid--dragging {
  cursor: grabbing;
}
.slot-grid--dragging * {
  cursor: grabbing !important;
}
</style>

<!-- ─── SlotBranchRenderer (内部递归子组件) ──────────────────────────────────── -->
<script lang="ts">
/**
 * 递归渲染 SlotBranch 的内部组件。
 * 使用 defineComponent 内联避免新建单独文件。
 */
import { defineComponent, computed as useComputed, h } from 'vue'
import type { PropType } from 'vue'
import SlotTabBarComponent from './SlotTabBar.vue'
import DropZoneOverlayComponent from './DropZoneOverlay.vue'
import SlotCollapseHandleComponent from './SlotCollapseHandle.vue'
import PaneErrorBoundaryComponent from './PaneErrorBoundary.vue'
import type { DropTarget as BranchDropTarget } from '../../composables/layout/slotGrid/types'

export const SlotBranchRenderer = defineComponent({
  name: 'SlotBranchRenderer',
  props: {
    branch: {
      type: Object as PropType<SlotBranch>,
      required: true,
    },
    collapsedSlots: {
      type: Object as PropType<Set<string>>,
      default: () => new Set<string>(),
    },
    parentPath: {
      type: Array as PropType<number[]>,
      default: () => [],
    },
    /** 拖拽进行中标志，驱动 DropZoneOverlay 可见性 */
    isDragging: {
      type: Boolean,
      default: false,
    },
    /** 当前 dnd drop target（null = 无悬停目标）*/
    dndTarget: {
      type: Object as PropType<BranchDropTarget | null>,
      default: null,
    },
  },
  emits: ['resize', 'resizeReset', 'tab-activate', 'tab-close', 'tab-dragstart', 'drop', 'collapse', 'leaf-grip-down'],
  setup(props, { slots, emit }) {
    const branchStyle = useComputed(() =>
      buildBranchCSS(
        props.branch.children,
        props.branch.sizes,
        props.branch.orientation,
        props.collapsedSlots
      )
    )

    const sashOrientation = useComputed(() => props.branch.orientation)
    const isMultiLeaf = useComputed(() => props.branch.children.length > 1)

    // tab bar 显示判断（与根组件逻辑一致）
    function shouldShowTabBar(leaf: SlotLeaf): boolean {
      const { tabs, tabBarVisible } = leaf.tabGroup
      return tabs.length > 1 || tabBarVisible === true
    }

    function isCollapsible(leaf: SlotLeaf): boolean {
      return leaf.constraints.collapsible === true
    }

    function leafPosition(leaf: SlotLeaf): 'before' | 'after' {
      const idx = props.branch.children.findIndex(
        n => n.type === 'leaf' && (n as SlotLeaf).id === leaf.id
      )
      return idx <= 0 ? 'before' : 'after'
    }

    return () => {
      const children: ReturnType<typeof h>[] = []

      props.branch.children.forEach((node, index) => {
        // 在非首项前插入 sash
        if (index > 0) {
          children.push(
            h(ResizeSash, {
              orientation: sashOrientation.value,
              onResize: (delta: number) => {
                emit('resize', props.parentPath, index - 1, delta)
              },
              onReset: () => {
                emit('resizeReset', props.parentPath, index - 1)
              },
            })
          )
        }

        if (node.type === 'leaf') {
          const leaf = node as SlotLeaf
          const collapsed = props.collapsedSlots.has(leaf.id) || leaf.collapsed
          const collapsible = isCollapsible(leaf)
          const showTabBar = shouldShowTabBar(leaf)

          const rawSlotContent = slots[leaf.id]
            ? slots[leaf.id]!({
                role: leaf.role,
                collapsed,
                leaf,
                activeTabId: leaf.tabGroup.activeTabId,
              })
            : undefined

          // 用 PaneErrorBoundary 包裹业务 slot 内容
          const guardedSlot = h(PaneErrorBoundaryComponent, null, {
            default: () => rawSlotContent,
          })

          let baseCellChildren: ReturnType<typeof h>[]

          if (showTabBar) {
            // 有 tab bar: flex 列 + TabBar + content wrapper
            baseCellChildren = [
              h(SlotTabBarComponent, {
                tabs: leaf.tabGroup.tabs,
                activeTabId: leaf.tabGroup.activeTabId,
                tabBarVisible: leaf.tabGroup.tabBarVisible,
                overflow: leaf.tabGroup.overflow,
                onTabActivate: (tabId: string) => emit('tab-activate', leaf.id, tabId),
                onTabClose: (tabId: string) => emit('tab-close', leaf.id, tabId),
                onTabDragstart: (tabId: string, ev: PointerEvent) =>
                  emit('tab-dragstart', leaf.id, tabId, ev),
              }),
              h('div', { class: 'slot-grid__cell-content' }, [guardedSlot]),
            ]
          } else if (collapsible && collapsed) {
            // 折叠态: 只显示 CollapseHandle
            baseCellChildren = [
              h(SlotCollapseHandleComponent, {
                leafId: leaf.id,
                role: leaf.role,
                label: leaf.role,
                collapsed: true,
                orientation: props.branch.orientation,
                position: leafPosition(leaf),
                onToggle: (leafId: string) => emit('collapse', leafId),
              }),
            ]
          } else {
            // 展开态 (无 tab bar): guarded slot 内容 + 可选折叠按钮
            baseCellChildren = [guardedSlot]
            if (collapsible) {
              baseCellChildren.push(
                h(SlotCollapseHandleComponent, {
                  leafId: leaf.id,
                  role: leaf.role,
                  label: leaf.role,
                  collapsed: false,
                  orientation: props.branch.orientation,
                  position: leafPosition(leaf),
                  onToggle: (leafId: string) => emit('collapse', leafId),
                })
              )
            }
          }

          // 面板拖拽 grip (dndEnabled 时始终显示，非折叠态，单 leaf 也可拖出分割)
          if (!collapsed) {
            baseCellChildren.push(
              h(
                'div',
                {
                  class: 'slot-grid__leaf-grip',
                  title: '拖动交换面板位置',
                  onPointerdown: (ev: PointerEvent) => {
                    ev.preventDefault()
                    ev.stopPropagation()
                    emit('leaf-grip-down', leaf.id, ev)
                  },
                },
                [
                  h(
                    'svg',
                    {
                      width: '10',
                      height: '10',
                      viewBox: '0 0 10 10',
                      fill: 'currentColor',
                      opacity: '0.4',
                    },
                    [
                      h('circle', { cx: '3', cy: '3', r: '1' }),
                      h('circle', { cx: '7', cy: '3', r: '1' }),
                      h('circle', { cx: '3', cy: '7', r: '1' }),
                      h('circle', { cx: '7', cy: '7', r: '1' }),
                    ]
                  ),
                ]
              )
            )
          }

          // 拖拽中叠加落区覆盖层
          if (props.isDragging) {
            baseCellChildren.push(
              h(DropZoneOverlayComponent, {
                active: true,
                leafId: leaf.id,
                highlightedZone:
                  props.dndTarget && props.dndTarget.leafId === leaf.id
                    ? props.dndTarget.position
                    : null,
                onDrop: (target: BranchDropTarget) => emit('drop', target),
              })
            )
          }

          const branchRoleLabels: Record<string, string> = {
            primary: '主面板',
            secondary: '次要面板',
            navigator: '导航面板',
            companion: '辅助面板',
          }
          children.push(
            h(
              'div',
              {
                class: [
                  'slot-grid__cell',
                  collapsed ? 'slot-grid__cell--collapsed' : '',
                  showTabBar ? 'slot-grid__cell--has-tabbar' : '',
                ],
                'data-leaf-id': leaf.id,
                role: 'region',
                'aria-label': branchRoleLabels[leaf.role] ?? `${leaf.role} 面板`,
              },
              baseCellChildren
            )
          )
        } else {
          // 递归 branch
          const branch = node as SlotBranch
          const newPath = [...props.parentPath, index]
          children.push(
            h(
              SlotBranchRenderer,
              {
                branch,
                collapsedSlots: props.collapsedSlots,
                parentPath: newPath,
                isDragging: props.isDragging,
                dndTarget: props.dndTarget,
                onResize: (path: number[], idx: number, delta: number) =>
                  emit('resize', path, idx, delta),
                onResizeReset: (path: number[], idx: number) =>
                  emit('resizeReset', path, idx),
                onTabActivate: (leafId: string, tabId: string) =>
                  emit('tab-activate', leafId, tabId),
                onTabClose: (leafId: string, tabId: string) =>
                  emit('tab-close', leafId, tabId),
                onTabDragstart: (leafId: string, tabId: string, ev: PointerEvent) =>
                  emit('tab-dragstart', leafId, tabId, ev),
                onDrop: (target: BranchDropTarget) => emit('drop', target),
                onCollapse: (leafId: string) => emit('collapse', leafId),
                onLeafGripDown: (leafId: string, ev: PointerEvent) =>
                  emit('leaf-grip-down', leafId, ev),
              },
              slots
            )
          )
        }
      })

      return h(
        'div',
        {
          class: 'slot-branch',
          style: branchStyle.value,
        },
        children
      )
    }
  },
})
</script>

<style>
/* slot-branch 的全局样式（内联组件无法使用 scoped） */
.slot-branch {
  display: grid;
  height: 100%;
  width: 100%;
  overflow: hidden;
}
.slot-branch:not(:has(.resize-sash--dragging)) {
  transition:
    grid-template-columns 0.2s ease,
    grid-template-rows 0.2s ease;
}
</style>
