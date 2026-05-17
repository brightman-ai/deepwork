<script setup lang="ts">
import type { AssistantBlock, AssistantToolEvent } from '../types'

const props = defineProps<{
  block: Extract<AssistantBlock, { type: 'tool-group' }>
}>()

type ToolFamily = 'todo' | 'write' | 'edit' | 'read' | 'bash' | 'search' | 'fetch' | 'browser' | 'workspace' | 'generic'

function toolFamily(tool: AssistantToolEvent): ToolFamily {
  const name = tool.name.toLowerCase()
  if (name.includes('todo')) return 'todo'
  if (name === 'write' || name.includes('write')) return 'write'
  if (name === 'edit' || name.includes('edit')) return 'edit'
  if (name === 'read' || name.includes('read')) return 'read'
  if (name === 'bash') return 'bash'
  if (name.includes('search') || name.includes('grep') || name.includes('glob')) return 'search'
  if (name.includes('fetch')) return 'fetch'
  if (name.includes('browser') || name.includes('page')) return 'browser'
  if (name.includes('workspace') || name.includes('save')) return 'workspace'
  return 'generic'
}

function toolIcon(family: ToolFamily): string {
  return ({
    todo: '□',
    write: '+',
    edit: '✎',
    read: '↗',
    bash: '$',
    search: '⌕',
    fetch: '↬',
    browser: '◉',
    workspace: '◇',
    generic: '·',
  } as Record<ToolFamily, string>)[family]
}

function toolVerb(family: ToolFamily): string {
  return ({
    todo: '任务',
    write: '写入',
    edit: '编辑',
    read: '读取',
    bash: '执行',
    search: '检索',
    fetch: '获取',
    browser: '浏览器',
    workspace: '保存',
    generic: '操作',
  } as Record<ToolFamily, string>)[family]
}

function browserToolName(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('inspect')) return '检查页面'
  if (lower.includes('search')) return '检索页面'
  if (lower.includes('read')) return '读取页面'
  return '浏览器动作'
}

function toolDisplayName(tool: AssistantToolEvent, family: ToolFamily): string {
  if (family === 'browser') return browserToolName(tool.name)
  if (family === 'workspace') return '保存材料'
  return toolVerb(family)
}

function toolSummary(tool: AssistantToolEvent, family: ToolFamily): string {
  const input = (tool.input ?? {}) as Record<string, unknown>
  if (family === 'bash') return String(input.command ?? '').slice(0, 90)
  if (family === 'read' || family === 'write' || family === 'edit') return String(input.path ?? input.file_path ?? '').slice(0, 90)
  if (family === 'search') return String(input.query ?? input.pattern ?? '').slice(0, 90)
  if (family === 'fetch') return String(input.url ?? '').slice(0, 90)
  if (family === 'browser') return String(input.query ?? input.chunk_id ?? input.scope ?? '').slice(0, 90)
  return tool.name
}

function toolState(tool: AssistantToolEvent): 'error' | 'running' | 'done' {
  if (tool.is_error) return 'error'
  if (tool.output === undefined) return 'running'
  return 'done'
}

function stateLabel(state: 'error' | 'running' | 'done'): string {
  if (state === 'error') return '错误'
  if (state === 'running') return '执行中'
  return '完成'
}
</script>

<template>
  <details
    v-if="props.block.tools.length"
    class="as-block as-tool-group"
    :open="props.block.tools.some(t => t.output === undefined && !t.is_error) || undefined"
    data-testid="assistant-tool-group"
  >
    <summary>
      <span class="as-block__icon">{{ toolIcon(toolFamily(props.block.tools[0])) }}</span>
      <strong>
        {{
          props.block.tools.length === 1
            ? toolDisplayName(props.block.tools[0], toolFamily(props.block.tools[0]))
            : `${toolVerb(toolFamily(props.block.tools[0]))} ×${props.block.tools.length}`
        }}
      </strong>
      <span v-if="props.block.tools.length === 1" class="as-tool__summary">
        {{ toolSummary(props.block.tools[0], toolFamily(props.block.tools[0])) }}
      </span>
      <span
        v-if="props.block.tools.some(t => t.output === undefined && !t.is_error)"
        class="as-spinner as-spinner--inline"
      />
      <span
        :class="[
          'as-badge',
          props.block.tools.some(t => t.is_error)
            ? 'as-badge--error'
            : props.block.tools.some(t => t.output === undefined && !t.is_error)
              ? 'as-badge--running'
              : 'as-badge--done',
        ]"
      >
        {{
          props.block.tools.some(t => t.is_error)
            ? '错误'
            : props.block.tools.some(t => t.output === undefined && !t.is_error)
              ? '执行中'
              : '完成'
        }}
      </span>
    </summary>
    <div class="as-tool-group__list">
      <div
        v-for="tool in props.block.tools"
        :key="tool.id"
        :class="['as-block', 'as-tool', `as-tool--${toolFamily(tool).toLowerCase()}`]"
        data-testid="assistant-tool-card"
      >
        <span class="as-block__icon">{{ toolIcon(toolFamily(tool)) }}</span>
        <strong>{{ toolDisplayName(tool, toolFamily(tool)) }}</strong>
        <span class="as-tool__summary">{{ toolSummary(tool, toolFamily(tool)) }}</span>
        <span :class="['as-badge', `as-badge--${toolState(tool)}`]">{{ stateLabel(toolState(tool)) }}</span>
      </div>
    </div>
  </details>
</template>
