import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { useScenarioMachine } from './useScenarioMachine'
import { useBreakpoint } from './useBreakpoint'
import type { ScenarioMachineConfig, ScenarioState, LayoutPattern, SlotConfig, Breakpoint } from './types'
import type { ScenarioMachineResult } from './useScenarioMachine'
import type { BreakpointState } from './useBreakpoint'

export interface PortalLayoutConfig {
  portalId: string
  scenarios: ScenarioMachineConfig
  /**
   * Override layout/slots per breakpoint+scenario.
   * Key structure: breakpoint → scenario name → partial ScenarioState override.
   */
  breakpointOverrides?: Partial<Record<Breakpoint, Partial<Record<string, Partial<ScenarioState>>>>>
}

export interface PortalLayoutResult {
  scenario: ScenarioMachineResult
  breakpoint: BreakpointState
  pattern: ComputedRef<LayoutPattern>
  slots: ComputedRef<Record<string, SlotConfig | null>>
  hasSlot: (role: string) => boolean
  getSlot: (role: string) => SlotConfig | null
  /** 当前场景是否启用顶部 header（来自场景状态 showHeader 字段） */
  showHeader: ComputedRef<boolean>
}

export function usePortalLayout(config: PortalLayoutConfig): PortalLayoutResult {
  const scenario  = useScenarioMachine(config.portalId, config.scenarios)
  const breakpoint = useBreakpoint()

  const resolvedState = computed<ScenarioState>(() => {
    const bp = breakpoint.breakpoint.value
    const sc = scenario.current.value
    const override = config.breakpointOverrides?.[bp]?.[sc]
    if (!override) return scenario.currentState.value
    return {
      ...scenario.currentState.value,
      ...override,
      slots: { ...scenario.currentState.value.slots, ...(override.slots ?? {}) },
    }
  })

  const pattern = computed<LayoutPattern>(() => resolvedState.value.layout)

  const slots = computed<Record<string, SlotConfig | null>>(() => {
    const result: Record<string, SlotConfig | null> = {}
    for (const [role, cfg] of Object.entries(resolvedState.value.slots)) {
      result[role] = cfg
    }
    return result
  })

  function hasSlot(role: string): boolean {
    return role in slots.value && slots.value[role] !== null
  }

  function getSlot(role: string): SlotConfig | null {
    return slots.value[role] ?? null
  }

  // 从场景配置中派生 — 未标注时默认 false
  const showHeader = computed<boolean>(() => resolvedState.value.showHeader ?? false)

  return { scenario, breakpoint, pattern, slots, hasSlot, getSlot, showHeader }
}
