<script setup lang="ts">
/**
 * PortalSectionHost — the shared shell for any section-composable portal. It renders the
 * sections registered into a `slot` (see framework/portal/sections.ts), so a portal's content
 * is the UNION of sections contributed by every repo in the build — defined once each, never
 * duplicated per host. This is the SSOT shell: terminal-standalone and pro both mount it, so
 * the settings UI cannot diverge.
 *
 * Layout is pure-CSS responsive (no breakpoint composable coupling): a category rail beside the
 * content on wide viewports, a sticky bottom tab strip on narrow ones.
 */
import { computed, defineAsyncComponent, markRaw, ref, watch, type Component } from 'vue'
import { useRoute } from 'vue-router'
import { getPortalSections, type PortalSection } from '@ce/framework/portal'

const props = defineProps<{
  /** Extension point to render, e.g. 'settings'. (Named `slotId`, not `slot`, to avoid Vue's
   *  historical `slot` attribute special-casing.) */
  slotId: string
}>()

// Sections register at import time (side-effect imports in the host's router), so they are all
// present before this mounts. Re-read when the slot changes.
const sections = computed<PortalSection[]>(() => getPortalSections(props.slotId))

const route = useRoute()

const activeId = ref<string>('')
watch(
  sections,
  (list) => {
    if (list.some((s) => s.id === activeId.value)) return
    // Deep-link: honor ?section=<id> when it names a registered section (e.g. the notify
    // quick-sheet's "完整设置" jumps straight to terminal.notifications). Read only when
    // resolving an initial/invalid selection, so a later tab click is never overridden.
    const wanted = typeof route.query.section === 'string' ? route.query.section : ''
    activeId.value = (wanted && list.some((s) => s.id === wanted)) ? wanted : (list[0]?.id ?? '')
  },
  { immediate: true },
)

// Resolve each section's component once (lazy loaders → async components), cached by id.
const resolved = new Map<string, Component>()
function componentFor(section: PortalSection): Component {
  const cached = resolved.get(section.id)
  if (cached) return cached
  const comp =
    typeof section.component === 'function'
      ? defineAsyncComponent(section.component as () => Promise<{ default: Component }>)
      : markRaw(section.component)
  resolved.set(section.id, comp)
  return comp
}

const activeSection = computed(() => sections.value.find((s) => s.id === activeId.value) ?? null)
const activeComponent = computed(() => (activeSection.value ? componentFor(activeSection.value) : null))

function select(id: string): void {
  activeId.value = id
}
</script>

<template>
  <div class="psh" data-testid="portal-section-host">
    <!-- Category rail / mobile tab strip — one list, restyled per viewport via CSS. -->
    <nav class="psh-rail" :aria-label="`${slotId} 分类`">
      <button
        v-for="s in sections"
        :key="s.id"
        class="psh-rail-item"
        :class="{ 'is-active': s.id === activeId }"
        :data-testid="`section-tab-${s.id}`"
        type="button"
        @click="select(s.id)"
      >
        <component :is="s.icon" v-if="s.icon" class="psh-rail-icon" />
        <span class="psh-rail-label">{{ s.label }}</span>
      </button>
    </nav>

    <!-- Active section content. -->
    <main class="psh-content" :data-testid="`section-content-${activeId}`">
      <component :is="activeComponent" v-if="activeComponent" />
      <div v-else class="psh-empty">没有可显示的设置项。</div>
    </main>
  </div>
</template>

<style scoped>
.psh {
  display: flex;
  height: 100%;
  width: 100%;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  overflow: hidden;
}

/* ── Rail (wide viewport: left column) ─────────────────────────────────────── */
.psh-rail {
  flex-shrink: 0;
  width: 200px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 8px;
  border-right: 1px solid hsl(var(--border));
  overflow-y: auto;
}
.psh-rail-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: hsl(var(--muted-foreground));
  font-size: 0.86rem;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.psh-rail-item:hover { background: hsl(var(--muted)); color: hsl(var(--foreground)); }
.psh-rail-item.is-active { background: hsl(var(--muted)); color: hsl(var(--primary)); font-weight: 600; }
.psh-rail-icon { width: 17px; height: 17px; flex-shrink: 0; }
.psh-rail-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.psh-content { flex: 1; min-width: 0; overflow-y: auto; }
.psh-empty { padding: 24px; color: hsl(var(--muted-foreground)); font-size: 0.85rem; }

/* ── Narrow viewport: content first, rail becomes a sticky bottom tab strip ──── */
@media (max-width: 768px) {
  .psh { flex-direction: column; }
  .psh-content { order: 1; }
  .psh-rail {
    order: 2;
    width: 100%;
    flex-direction: row;
    gap: 4px;
    padding: 6px 8px calc(6px + env(safe-area-inset-bottom, 0px));
    border-right: 0;
    border-top: 1px solid hsl(var(--border));
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    background: hsl(var(--background));
  }
  .psh-rail::-webkit-scrollbar { display: none; }
  .psh-rail-item {
    flex-direction: column;
    gap: 3px;
    flex-shrink: 0;
    padding: 6px 12px;
    font-size: 0.66rem;
  }
  .psh-rail-label { font-size: 0.66rem; }
}
</style>
