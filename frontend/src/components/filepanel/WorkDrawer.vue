<script setup lang="ts">
/**
 * WorkDrawer — the ONE shared right-sidebar work panel (SSOT). Owns the tab shell +
 * switching chrome and the two universal tabs — 文件 (FilePanel, fed a FileSource) and
 * 总览 (SessionOverview, fed SessionOverviewData). Host-specific tabs (git 审查, 历史输入,
 * LiveView…) are injected by the host via `extraTabs` + the `#panel` slot, so the terminal
 * drawer, ws-portal WorkArea and share panel are the SAME component with different data +
 * a few host tabs — never three forked shells. Carries ZERO endpoint/auth knowledge.
 */
import { ref, computed, watch } from 'vue'
import type { FileSource, SessionOverviewData } from './types'
import FilePanel from './FilePanel.vue'
import SessionOverview from './SessionOverview.vue'

interface TabDef { id: string; label: string }

const props = defineProps<{
  /** 文件 tab — omit to hide it. */
  fileSource?: FileSource
  fileTitle?: string
  /** 总览 tab — omit to hide it. */
  overview?: SessionOverviewData
  /** host-specific tabs (e.g. {id:'review',label:'审查'}); render their body via #panel. */
  extraTabs?: TabDef[]
}>()

const tabs = computed<TabDef[]>(() => {
  const t: TabDef[] = []
  if (props.fileSource) t.push({ id: 'files', label: '文件' })
  if (props.overview) t.push({ id: 'overview', label: '总览' })
  for (const e of props.extraTabs ?? []) t.push(e)
  return t
})
const active = ref('')
watch(tabs, (t) => { if (!t.some((x) => x.id === active.value) && t.length) active.value = t[0].id }, { immediate: true })
const isBuiltin = (id: string) => id === 'files' || id === 'overview'
</script>

<template>
  <div class="wd" data-testid="work-drawer">
    <div class="wd-tabs">
      <button
        v-for="t in tabs" :key="t.id"
        class="wd-tab" :class="{ 'is-on': active === t.id }"
        type="button" :data-testid="`wd-tab-${t.id}`"
        @click="active = t.id"
      >{{ t.label }}</button>
    </div>
    <div class="wd-body">
      <FilePanel v-if="fileSource" v-show="active === 'files'" class="wd-fill" :source="fileSource" :title="fileTitle || '文件'" />
      <SessionOverview v-if="overview && active === 'overview'" class="wd-fill" v-bind="overview" />
      <!-- host-specific tab bodies: the host renders by id via this scoped slot. -->
      <div v-if="!isBuiltin(active)" class="wd-fill"><slot name="panel" :tab="active" /></div>
    </div>
  </div>
</template>

<style scoped>
.wd { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--dw-sf, hsl(var(--card))); }
.wd-tabs { display: flex; gap: 2px; padding: 6px 8px; border-bottom: 1px solid var(--dw-bd, hsl(var(--border))); flex-shrink: 0; overflow-x: auto; }
.wd-tab { font-size: 12px; padding: 4px 12px; border-radius: 6px; border: none; background: none; cursor: pointer; color: var(--dw-mu, hsl(var(--muted-foreground))); white-space: nowrap; flex-shrink: 0; }
.wd-tab:hover { background: var(--dw-sf2, hsl(var(--muted))); color: var(--dw-fg, hsl(var(--foreground))); }
.wd-tab.is-on { background: var(--dw-ac-dim, hsl(var(--muted))); color: var(--dw-ac, hsl(var(--primary))); font-weight: 600; }
.wd-body { flex: 1; min-height: 0; position: relative; display: flex; }
.wd-fill { flex: 1; min-width: 0; min-height: 0; }
</style>
