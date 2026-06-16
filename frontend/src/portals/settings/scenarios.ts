import type { ScenarioMachineConfig } from '@ce/composables/layout/types'

/**
 * Minimal scenario config for the section-host settings portal. The route component
 * (SettingsPortal.vue → PortalSectionHost) is self-contained and does NOT drive the scenario
 * machine (it owns its own category rail), so this exists only to satisfy the PortalDescriptor
 * contract. `panelKind: 'flat'` (set on the descriptor) keeps MainLayout from reserving the
 * left project/session column — the host renders its own rail.
 */
export const settingsScenarios: ScenarioMachineConfig = {
  initial: 'main',
  states: {
    main: {
      layout: 'solo',
      slots: {
        primary: { pane: 'settings', primitive: 'FormPane', mode: 'page' },
      },
      on: {},
    },
  },
}
