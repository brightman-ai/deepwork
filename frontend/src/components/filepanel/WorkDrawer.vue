<script setup lang="ts">
/**
 * WorkDrawer — the ONE shared right-sidebar work panel (SSOT). Owns the tab shell +
 * switching chrome and the two universal tabs — 文件 (FilePanel, fed a FileSource) and
 * 总览 (SessionOverview OR an #overview slot). Host-specific tabs (git 审查, 历史输入,
 * LiveView…) are injected via `extraTabs` + the `#panel` slot, so the terminal drawer,
 * ws-portal WorkArea and share panel are the SAME component with different data — never
 * three forked shells. Carries ZERO endpoint/auth knowledge.
 *
 * Drawer chrome (opt-in): `resizable` adds a left-edge drag-resize with a persisted width;
 * `collapsible` adds a collapse-to-summon-handle. Both keep every panel MOUNTED (v-show,
 * never v-if) so a tab switch / collapse-reopen restores exactly what the user was reading
 * — the terminal ResourceDrawer behavior, promoted here so every host inherits it.
 */
import { ref, computed, watch, onBeforeUnmount, useSlots } from 'vue'
import type { FileSource, SessionOverviewData } from './types'
import FilePanel from './FilePanel.vue'
import SessionOverview from './SessionOverview.vue'

interface TabDef { id: string; label: string }

const props = withDefaults(defineProps<{
  /** 文件 tab — omit to hide it. */
  fileSource?: FileSource
  fileTitle?: string
  /** 总览 tab — omit to hide it. Provide either this (default SessionOverview) OR an
   *  #overview slot (a richer host overview, e.g. share's OverviewPanel). */
  overview?: SessionOverviewData
  /** host-specific tabs (e.g. {id:'review',label:'审查'}); render their body via #panel. */
  extraTabs?: TabDef[]
  /** Drawer chrome (opt-in): left-edge drag-resize; width persists to localStorage. */
  resizable?: boolean
  /** Drawer chrome (opt-in): collapse to a slim summon handle (panels stay mounted). */
  collapsible?: boolean
  /** localStorage key root for the persisted width + collapsed state (per host). */
  widthKey?: string
  /** Initial width (px) before any drag / stored value. */
  defaultWidth?: number
}>(), {
  resizable: false,
  collapsible: false,
  widthKey: 'dw.wd',
  defaultWidth: 320,
})

const slots = useSlots()

const tabs = computed<TabDef[]>(() => {
  const t: TabDef[] = []
  if (props.fileSource) t.push({ id: 'files', label: '文件' })
  if (props.overview || slots.overview) t.push({ id: 'overview', label: '总览' })
  for (const e of props.extraTabs ?? []) t.push(e)
  return t
})
const active = ref('')
watch(tabs, (t) => { if (!t.some((x) => x.id === active.value) && t.length) active.value = t[0].id }, { immediate: true })
const isBuiltin = (id: string) => id === 'files' || id === 'overview'

// ── drawer chrome: persisted width + collapse (opt-in) ──────────────────────────
const MIN_W = 280
const wKey = computed(() => `${props.widthKey}.width`)
const cKey = computed(() => `${props.widthKey}.collapsed`)
function clampW(w: number): number {
  const max = typeof window !== 'undefined' ? Math.round(window.innerWidth * 0.92) : 960
  return Math.max(MIN_W, Math.min(max, w))
}
function loadWidth(): number {
  try {
    const v = parseInt(localStorage.getItem(wKey.value) || '', 10)
    if (Number.isFinite(v) && v > 0) return clampW(v)
  } catch { /* ignore */ }
  return props.defaultWidth
}
const panelWidth = ref(loadWidth())
const collapsed = ref((() => { try { return localStorage.getItem(cKey.value) === '1' } catch { return false } })())
function setCollapsed(v: boolean): void {
  collapsed.value = v
  try { localStorage.setItem(cKey.value, v ? '1' : '0') } catch { /* ignore */ }
}
const isCollapsed = computed(() => props.collapsible && collapsed.value)

// The host owns its own width ONLY when resizable + expanded; otherwise it fills its
// parent (backward-compatible with every non-opt-in consumer).
const hostStyle = computed(() => (props.resizable && !isCollapsed.value)
  ? { width: `${panelWidth.value}px`, flexBasis: `${panelWidth.value}px`, flexGrow: 0, flexShrink: 0 }
  : {})

let resizing = false
let startX = 0
let startW = 0
// Pointer capture + window-level move/up = the robust drag (survives the pointer crossing
// other panes); mirrors the terminal ResourceDrawer. Right-anchored → dragging left grows.
function onResizeStart(e: PointerEvent): void {
  resizing = true
  startX = e.clientX
  startW = panelWidth.value
  try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* best effort */ }
  document.documentElement.classList.add('dw-wd-resizing')
  window.addEventListener('pointermove', onResizeMove, { passive: false })
  window.addEventListener('pointerup', onResizeEnd)
  window.addEventListener('pointercancel', onResizeEnd)
  e.preventDefault()
  e.stopPropagation()
}
function onResizeMove(e: PointerEvent): void {
  if (!resizing) return
  e.preventDefault()
  panelWidth.value = clampW(startW + (startX - e.clientX))
}
function onResizeEnd(): void {
  if (!resizing) return
  resizing = false
  document.documentElement.classList.remove('dw-wd-resizing')
  try { localStorage.setItem(wKey.value, String(panelWidth.value)) } catch { /* ignore */ }
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', onResizeEnd)
  window.removeEventListener('pointercancel', onResizeEnd)
}
onBeforeUnmount(() => { if (resizing) onResizeEnd() })
</script>

<template>
  <div class="wd-host" :class="{ 'wd-host--collapsed': isCollapsed }" :style="hostStyle">
    <!-- Collapsed → slim summon handle. The drawer body stays MOUNTED (v-show) so the
         open file / scroll / active tab are all restored on reopen. -->
    <button
      v-if="isCollapsed"
      class="wd-summon" type="button" title="展开面板" data-testid="wd-expand"
      @click="setCollapsed(false)"
    >‹</button>

    <!-- Left-edge drag-resize grip. -->
    <div
      v-if="resizable && !isCollapsed"
      class="wd-resize" title="拖动改变宽度" data-testid="wd-resize"
      @pointerdown="onResizeStart"
    />

    <div v-show="!isCollapsed" class="wd" data-testid="work-drawer">
      <div class="wd-tabs">
        <button
          v-for="t in tabs" :key="t.id"
          class="wd-tab" :class="{ 'is-on': active === t.id }"
          type="button" :data-testid="`wd-tab-${t.id}`"
          @click="active = t.id"
        >{{ t.label }}</button>
        <button
          v-if="collapsible"
          class="wd-collapse" type="button" title="收起面板" data-testid="wd-collapse"
          @click="setCollapsed(true)"
        >›</button>
      </div>
      <div class="wd-body">
        <FilePanel v-if="fileSource" v-show="active === 'files'" class="wd-fill" :source="fileSource" :title="fileTitle || '文件'" />
        <!-- 总览: an #overview slot (rich host overview, e.g. share's OverviewPanel) wins;
             else the built-in SessionOverview. v-show (not v-if) keeps it mounted so a tab
             switch never re-fetches / loses its scroll — parity with the FilePanel above. -->
        <div v-if="overview || slots.overview" v-show="active === 'overview'" class="wd-fill wd-ovwrap">
          <slot name="overview"><SessionOverview v-if="overview" class="wd-fill" v-bind="overview" /></slot>
        </div>
        <!-- host-specific tab bodies: the host renders by id via this scoped slot. -->
        <div v-if="!isBuiltin(active)" class="wd-fill"><slot name="panel" :tab="active" /></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wd-host { position: relative; display: flex; height: 100%; min-height: 0; width: 100%; }
.wd-host--collapsed { width: auto; flex: 0 0 auto; }
.wd { display: flex; flex-direction: column; flex: 1; min-width: 0; height: 100%; min-height: 0; background: var(--dw-sf, hsl(var(--card))); }
.wd-tabs { display: flex; align-items: center; gap: 2px; padding: 6px 8px; border-bottom: 1px solid var(--dw-bd, hsl(var(--border))); flex-shrink: 0; overflow-x: auto; }
.wd-tab { font-size: 12px; padding: 4px 12px; border-radius: 6px; border: none; background: none; cursor: pointer; color: var(--dw-mu, hsl(var(--muted-foreground))); white-space: nowrap; flex-shrink: 0; }
.wd-tab:hover { background: var(--dw-sf2, hsl(var(--muted))); color: var(--dw-fg, hsl(var(--foreground))); }
.wd-tab.is-on { background: var(--dw-ac-dim, hsl(var(--muted))); color: var(--dw-ac, hsl(var(--primary))); font-weight: 600; }
.wd-collapse { margin-left: auto; flex-shrink: 0; width: 22px; height: 22px; border: none; border-radius: 6px; background: none; cursor: pointer; color: var(--dw-mu, hsl(var(--muted-foreground))); font-size: 15px; line-height: 1; }
.wd-collapse:hover { background: var(--dw-sf2, hsl(var(--muted))); color: var(--dw-fg, hsl(var(--foreground))); }
.wd-body { flex: 1; min-height: 0; position: relative; display: flex; }
.wd-fill { flex: 1; min-width: 0; min-height: 0; }
/* overview wrapper: lay the slotted overview (SessionOverview OR a host's OverviewPanel)
   out as a fill-height flex child so it owns its own internal scroll. */
.wd-ovwrap { display: flex; flex-direction: column; overflow: hidden; }
.wd-ovwrap > * { flex: 1; min-height: 0; }
/* left-edge drag-resize grip: a slim hit-area with a visible hairline on hover/drag. */
.wd-resize { position: absolute; left: -3px; top: 0; bottom: 0; width: 8px; z-index: 3; cursor: col-resize; touch-action: none; }
.wd-resize::after { content: ''; position: absolute; left: 3px; top: 0; bottom: 0; width: 1px; background: transparent; transition: background 0.12s; }
.wd-resize:hover::after { background: var(--dw-ac, hsl(var(--primary))); }
/* collapsed summon handle. */
.wd-summon { width: 22px; height: 100%; border: none; border-left: 1px solid var(--dw-bd, hsl(var(--border))); background: var(--dw-sf, hsl(var(--card))); color: var(--dw-mu, hsl(var(--muted-foreground))); cursor: pointer; font-size: 15px; line-height: 1; }
.wd-summon:hover { background: var(--dw-sf2, hsl(var(--muted))); color: var(--dw-ac, hsl(var(--primary))); }
</style>

<!-- Global (non-scoped): pin the col-resize cursor + kill text selection for the WHOLE
     drag, even as the pointer travels over panes that set their own user-select. -->
<style>
html.dw-wd-resizing, html.dw-wd-resizing * { user-select: none !important; cursor: col-resize !important; }
</style>
