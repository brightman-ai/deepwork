import type { Component } from 'vue'

type BlockKind = 'text' | 'thinking' | 'tool-group' | 'task-plan' | 'permission' | 'waiting' | 'error' | 'usage'
  // CHG-014 D2: v6 流习语块 — 纯 chrome，与既有核心块同级注册。
  // S8 F1: `approval` 已并入 `permission` 单一契约（见 types.ts），不再单独注册。
  | 'strip' | 'live-head' | 'artifact' | 'qbanner' | 'diff'
  // CHG-014 Runtime-SSOT P2: subagent 子流块 (核心, 嵌套 inner blocks 经本 registry 同源渲染)。
  | 'agent'

// CHG-014 S8 F4: 保留 core kind 清单（文档化策略）。这些 type 是 @ce 基座保留字，
// 由 registerCore 占用、不可被 registerExtension override（existing.core 守卫会拒绝）。
// pro 侧扩展块必须用独立命名空间 kind（如 'question-form' / 'produced-files'），
// 不得复用这些名字。已核对 pro registerOdBlocks.ts 无冲突。
export const RESERVED_CORE_KINDS = [
  'text', 'thinking', 'tool-group', 'task-plan', 'permission', 'waiting', 'error', 'usage',
  'strip', 'live-head', 'artifact', 'qbanner', 'diff', 'agent',
] as const

interface BlockRegistryEntry {
  kind: string
  component: Component
  core: boolean // true = cannot be overridden
}

class BlockRegistry {
  private entries = new Map<string, BlockRegistryEntry>()

  registerCore(kind: BlockKind, component: Component) {
    this.entries.set(kind, { kind, component, core: true })
  }

  registerExtension(kind: string, component: Component, opts?: { override?: boolean }) {
    const existing = this.entries.get(kind)
    if (existing?.core) {
      console.warn(`Cannot override core block: ${kind}`)
      return
    }
    // Re-registering the same component is an idempotent no-op; replacing a
    // different owner's extension requires an explicit override so block
    // ownership stays visible (CHG-013 D8).
    if (existing && existing.component !== component && !opts?.override) {
      throw new Error(`Extension block "${kind}" is already registered; pass { override: true } to replace it`)
    }
    this.entries.set(kind, { kind, component, core: false })
  }

  resolve(kind: string): Component | undefined {
    return this.entries.get(kind)?.component
  }

  has(kind: string): boolean {
    return this.entries.has(kind)
  }

  listExtensions(): string[] {
    return [...this.entries.values()].filter(e => !e.core).map(e => e.kind)
  }
}

export const blockRegistry = new BlockRegistry()

// Register 7 core blocks (text block 通过 blockRegistry 注册，surface 内联路径同样保留)
import TextBlock from './blocks/TextBlock.vue'
import ThinkingBlock from './blocks/ThinkingBlock.vue'
import ToolGroupBlock from './blocks/ToolGroupBlock.vue'
import TaskPlanBlock from './blocks/TaskPlanBlock.vue'
import WaitingBlock from './blocks/WaitingBlock.vue'
import PermissionBlock from './blocks/PermissionBlock.vue'
import ErrorBlock from './blocks/ErrorBlock.vue'
import UsageFooter from './blocks/UsageFooter.vue'
// CHG-014 D2: v6 流习语块
import StripBlock from './blocks/StripBlock.vue'
import LiveHead from './blocks/LiveHead.vue'
import ArtifactCard from './blocks/ArtifactCard.vue'
import QBanner from './blocks/QBanner.vue'
import DiffBlock from './blocks/DiffBlock.vue'
// CHG-014 Runtime-SSOT P2: subagent 子流块
import AgentBlock from './blocks/AgentBlock.vue'

blockRegistry.registerCore('text', TextBlock)
blockRegistry.registerCore('thinking', ThinkingBlock)
blockRegistry.registerCore('tool-group', ToolGroupBlock)
blockRegistry.registerCore('task-plan', TaskPlanBlock)
blockRegistry.registerCore('waiting', WaitingBlock)
blockRegistry.registerCore('permission', PermissionBlock)
blockRegistry.registerCore('error', ErrorBlock)
blockRegistry.registerCore('usage', UsageFooter)
// S8 F1: `permission` 单一契约即审批卡（PermissionBlock 读 title/command/tool/waited）。
// 不再为 `approval` 注册独立条目（避免与 PermissionBlock 的 content/effectClass 错位）。
blockRegistry.registerCore('strip', StripBlock)
blockRegistry.registerCore('live-head', LiveHead)
blockRegistry.registerCore('artifact', ArtifactCard)
blockRegistry.registerCore('qbanner', QBanner)
blockRegistry.registerCore('diff', DiffBlock)
// CHG-014 Runtime-SSOT P2: subagent 子流 (Task/Agent tool_use → 嵌套子流, 不卷收)
blockRegistry.registerCore('agent', AgentBlock)
