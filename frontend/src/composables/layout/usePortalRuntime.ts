import { provide, inject } from 'vue'
import type { InjectionKey, ComputedRef, Ref } from 'vue'
import { usePortalLayout } from './usePortalLayout'
import { useLayoutPolicy } from './useLayoutPolicy'
import { useDontDisturb } from './useDontDisturb'
import { providePortalEvents } from './usePortalEvents'
import { usePlatform } from '@ce/composables/platform'
import type { PortalLayoutConfig, PortalLayoutResult } from './usePortalLayout'
import type { LayoutPolicyResult, LayoutPolicyConfig } from './useLayoutPolicy'
import type { DontDisturbResult } from './useDontDisturb'
import type { PortalEventBusAPI } from './usePortalEvents'
import type { BreakpointState } from './useBreakpoint'
import type { PlatformContext } from '@ce/composables/platform'
import type { LayoutPattern } from './types'

/**
 * Input config for usePortalRuntime.
 * Mirrors the three call sites in a typical portal shell:
 *   usePortalLayout({ portalId, scenarios, breakpointOverrides })
 *   useLayoutPolicy(layoutPolicy)
 *   useDontDisturb(portalId, scenario.current)
 *   providePortalEvents()
 */
export interface PortalRuntimeConfig
  extends Pick<PortalLayoutConfig, 'portalId' | 'scenarios' | 'breakpointOverrides'> {
  layoutPolicy?: LayoutPolicyConfig
}

// Re-export for consumers who only want the result type
export type { PortalLayoutResult, LayoutPolicyResult, DontDisturbResult, PortalEventBusAPI }

export interface PortalRuntimeResult {
  /** Full layout result: scenario machine + breakpoint + slot accessors */
  layout: PortalLayoutResult
  /** Convenience alias — same as layout.scenario */
  scenario: PortalLayoutResult['scenario']
  /** Convenience alias — same as layout.breakpoint */
  breakpoint: BreakpointState
  /** 当前 layout pattern，如 'solo' / 'main-sidebar'（来自 layout.pattern） */
  pattern: ComputedRef<LayoutPattern>
  /** 检查当前场景中某 slot 是否存在（来自 layout.hasSlot） */
  hasSlot: (slotId: string) => boolean
  /** 当前场景是否显示顶部 RunContextBar（来自场景配置 showHeader 字段） */
  showHeader: ComputedRef<boolean>
  /** Layout policy (slot expand/badge/collapse) */
  policy: LayoutPolicyResult
  /** 手动展开/折叠状态（来自 policy.slotExpanded） */
  slotExpanded: Ref<Record<string, boolean>>
  /** Per-slot user preference persistence (don't-disturb) */
  dontDisturb: DontDisturbResult
  /** Portal-scoped event bus (provided to all child panes) */
  bus: PortalEventBusAPI
  /** Platform context (wails-macos / wails-windows / browser-desktop / browser-mobile) */
  platform: PlatformContext
}

/** Injection key so child panes can inject the runtime without prop drilling */
export const PORTAL_RUNTIME_KEY: InjectionKey<PortalRuntimeResult> = Symbol('portalRuntime')

/**
 * Compose all layout composables into one entry point for portal shells.
 *
 * Call this once in the portal's `<script setup>`:
 *
 *   const runtime = usePortalRuntime({
 *     portalId: 'chat',
 *     scenarios: chatScenarios,
 *     layoutPolicy: chatLayoutPolicy,
 *   })
 *   const { layout, scenario, breakpoint, policy, dontDisturb, bus } = runtime
 *
 * The result is automatically provided via inject so child panes can call
 * `injectPortalRuntime()` instead of receiving props.
 *
 * Existing portals do NOT have to migrate — usePortalLayout / useLayoutPolicy /
 * useDontDisturb / providePortalEvents remain available individually.
 */
export function usePortalRuntime(config: PortalRuntimeConfig): PortalRuntimeResult {
  // 1. Scenario machine + breakpoint + slot resolution
  const layout = usePortalLayout({
    portalId: config.portalId,
    scenarios: config.scenarios,
    breakpointOverrides: config.breakpointOverrides,
  })

  // 2. Layout policy (slot expand/badge rules)
  const policy = useLayoutPolicy(config.layoutPolicy ?? { effects: {} })

  // 3. Don't-disturb (per-slot user preference, persisted to localStorage)
  const dontDisturb = useDontDisturb(config.portalId, layout.scenario.current)

  // 4. Portal-scoped event bus (provided to child panes via inject)
  const bus = providePortalEvents()

  // 5. Platform context (wails vs browser, mobile vs desktop)
  const platform = usePlatform()

  const result: PortalRuntimeResult = {
    layout,
    scenario: layout.scenario,
    breakpoint: layout.breakpoint,
    // 便捷提升 — 避免每个 portal 都写 const { x } = layout
    pattern: layout.pattern,
    hasSlot: layout.hasSlot,
    showHeader: layout.showHeader,
    policy,
    slotExpanded: policy.slotExpanded,
    dontDisturb,
    bus,
    platform,
  }

  // Make the full runtime injectable by child panes
  provide(PORTAL_RUNTIME_KEY, result)

  return result
}

/**
 * Inject the portal runtime in a child pane component.
 * Returns null if called outside a portal shell (e.g. during isolated dev).
 */
export function injectPortalRuntime(): PortalRuntimeResult | null {
  return inject(PORTAL_RUNTIME_KEY, null)
}
