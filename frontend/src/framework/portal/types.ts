import type { Component } from 'vue'
import type { RouteRecordRaw } from 'vue-router'
import type { ScenarioMachineConfig } from '@ce/composables/layout/types'
import type { LayoutPolicyConfig } from '@ce/composables/layout/useLayoutPolicy'

export type { ScenarioMachineConfig, LayoutPolicyConfig }
export type { RouteRecordRaw }

export interface TabConfig {
  id: string
  label: string
  icon?: Component
}

export interface PortalDescriptor {
  /** Unique portal identifier, e.g. 'chat', 'workspace' */
  id: string
  /** Human-readable portal name */
  label: string
  /** Icon component for navigation/tabs */
  icon: Component
  /** Vue Router route name this portal lives at */
  route: string
  /** Scenario state machine config */
  scenarios: ScenarioMachineConfig
  /** Optional layout policy (slot expand/badge rules) */
  layoutPolicy?: LayoutPolicyConfig
  /** Per-platform overrides */
  platforms?: {
    'browser-mobile'?: {
      overrideAll?: { pattern: string }
      bottomTabs?: TabConfig[]
    }
    'wails-floating'?: {
      overrideAll?: { pattern: string; density: string }
    }
  }
  /** Run-context chips and action ids surfaced in the RunContextBar */
  runContext?: {
    chips: string[]
    actions: string[]
  }
  /**
   * 路由记录列表 — 该 portal 拥有的所有 Vue Router 路由。
   * router/index.ts 从 registry 收集后统一注入，不再硬编码。
   */
  routes: RouteRecordRaw[]
}
