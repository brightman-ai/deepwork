/**
 * @ce Settings portal — the SSOT settings portal for every host (replaces the per-repo settings
 * portals that previously diverged). Owns: the portal descriptor + the section-host shell. Content
 * is contributed via `definePortalSection` from @ce (shared sections, imported below), terminal,
 * and pro. A host's router imports this module; terminal/pro additionally import their own section
 * bundles. There is exactly one `definePortal({ id: 'settings' })` across the codebase — here.
 */
import { Settings } from 'lucide-vue-next'
import { definePortal, portalRegistry } from '@ce/framework/portal'
import { settingsScenarios } from './scenarios'

// Register the @ce-owned shared sections (Internet Access / Cloudflare tunnel, …) into 'settings'.
import './sections'

import type { RouteRecordRaw } from 'vue-router'

export const settingsRoutes: RouteRecordRaw[] = [
  {
    path: '/portal/settings',
    name: 'portal-settings',
    component: () => import('./SettingsPortal.vue'),
    meta: { scrollMode: 'contained' },
  },
]

const settingsPortalDescriptor = definePortal({
  id: 'settings',
  label: '设置',
  icon: Settings,
  route: '/portal/settings',
  // The host owns its own category rail → no left project/session tree column.
  panelKind: 'flat',
  scenarios: settingsScenarios,
  routes: settingsRoutes,
})

portalRegistry.register(settingsPortalDescriptor)

export { settingsScenarios } from './scenarios'
export { default as SettingsPortal } from './SettingsPortal.vue'
export default settingsPortalDescriptor
