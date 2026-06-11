import type { Component } from 'vue'

type BlockKind = 'text' | 'thinking' | 'tool-group' | 'task-plan' | 'permission' | 'waiting' | 'error' | 'usage'

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

blockRegistry.registerCore('text', TextBlock)
blockRegistry.registerCore('thinking', ThinkingBlock)
blockRegistry.registerCore('tool-group', ToolGroupBlock)
blockRegistry.registerCore('task-plan', TaskPlanBlock)
blockRegistry.registerCore('waiting', WaitingBlock)
blockRegistry.registerCore('permission', PermissionBlock)
blockRegistry.registerCore('error', ErrorBlock)
blockRegistry.registerCore('usage', UsageFooter)
