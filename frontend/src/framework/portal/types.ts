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
  /**
   * 布局意图 — 该 portal 是否拥有左侧 project→session 导航树。
   *
   *   'tree' = 有 project/session 左树（teleport 进全局 `#dw-panel` 列）。
   *            chat/workspace/od/claw/council/settings 等 master-detail portal。
   *   'flat' = 无左树（顶部 tab 或单页）。browser/cli/topic/home 等。
   *
   * MainLayout 读此声明驱动 `.dw-panel-zone` 折叠（显式意图），CSS `:has(#dw-panel > *)`
   * 作防漂移兜底（声明与现实不符时仍正确）。二者一致即终局。
   *
   * 默认 'flat'（无树是更安全的默认 — 新 portal 不会意外占用 236px 列）。
   *
   * 新 portal 指引：有 project/session 树 → 设 'tree'，否则不设（默认 'flat'）。
   */
  panelKind?: 'tree' | 'flat'
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
