// Types — import separately for tree-shaking
export type {
  LayoutPattern,
  Breakpoint,
  Platform,
  SlotRole,
  SlotConfig,
  ScenarioState,
  ScenarioMachineConfig,
  PanePreference,
  LayoutEffect,
  LayoutPolicyContext,
} from './types'

// Composables
export { useBreakpoint } from './useBreakpoint'
export type { BreakpointState } from './useBreakpoint'

export { useScenarioMachine } from './useScenarioMachine'
export type { ScenarioMachineResult } from './useScenarioMachine'

export { usePortalLayout } from './usePortalLayout'
export type { PortalLayoutConfig, PortalLayoutResult } from './usePortalLayout'

export { useLayoutPolicy } from './useLayoutPolicy'
export type { LayoutPolicyConfig, LayoutPolicyResult, EffectHandler } from './useLayoutPolicy'

export { useDontDisturb } from './useDontDisturb'
export type { DontDisturbResult } from './useDontDisturb'

export { usePortalEvents, providePortalEvents, injectPortalEvents } from './usePortalEvents'
export type { PortalEventBusAPI } from './usePortalEvents'

export { usePortalRuntime, injectPortalRuntime, PORTAL_RUNTIME_KEY } from './usePortalRuntime'
export type { PortalRuntimeConfig, PortalRuntimeResult } from './usePortalRuntime'
