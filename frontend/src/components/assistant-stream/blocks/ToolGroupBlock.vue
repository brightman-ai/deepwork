<script lang="ts">
// 模块级唯一 id 计数（非 setup，全实例共享递增）。
let xpillSeq = 0
</script>

<script setup lang="ts">
// CHG-014 D2: 重塑到原型 xpill「已探索」范式 (原型 1094-1101)。
// xh 头 (已探索 N 文件·M 命令 + chev) → 展开 xb → 嵌套 sbl 工具行
// (chip ch-read/ch-bash/ch-edit/ch-write + bpath)。family→chip 映射保留。
import { reactive, ref } from 'vue'
import type { AssistantBlock, AssistantToolEvent } from '../types'
import { copyTextToClipboard } from '@ce/utils/clipboard'

const props = defineProps<{
  block: Extract<AssistantBlock, { type: 'tool-group' }>
}>()

const open = ref(false)
const copiedToolId = ref<string | null>(null)
const expandedToolIds = reactive(new Set<string>())
// F8 a11y: 折叠头 ↔ 内容关联。
const bodyId = `as-xpill-body-${++xpillSeq}`

type ToolFamily = 'todo' | 'write' | 'edit' | 'read' | 'bash' | 'search' | 'fetch' | 'browser' | 'workspace' | 'generic'

// CHG-016 R2 (F1): runtime-agnostic tool→family classifier. The old greedy
// substring rules were coupled to claude's vocabulary (Bash/Read/Edit/Write) and
// mis-bucketed every codex tool: `exec_command`→generic, `apply_patch`→generic,
// `update_plan`→generic, and worst `write_stdin`→'write' (a *file* family → empty
// path + a false "N 个文件" count). Classify by known names across claude + codex
// + deepwork, SPECIFIC before generic. Key correctness: `write_stdin` is
// process-stdin (command family), NOT a file write, so the command rule runs first
// and claude's file 'Write' is matched by exact name only.
function toolFamily(tool: AssistantToolEvent): ToolFamily {
  const name = tool.name.toLowerCase()
  // command / shell / exec — claude Bash · codex exec_command + write_stdin · ctx_execute
  if (name === 'bash' || name.includes('exec') || name.includes('shell') || name === 'write_stdin') return 'bash'
  // plan / todo — claude TodoWrite · codex update_plan
  if (name.includes('todo') || name.includes('plan')) return 'todo'
  // edit / patch — claude Edit · codex apply_patch · str_replace
  if (name.includes('edit') || name.includes('patch') || name.includes('str_replace')) return 'edit'
  // create / write file — claude Write (exact). write_stdin already routed above.
  if (name === 'write' || name.includes('writefile') || name.includes('create_file') || name === 'create') return 'write'
  // read / view file — claude Read · view/cat
  if (name === 'read' || name.includes('readfile') || name.includes('view') || name === 'cat') return 'read'
  if (name.includes('search') || name.includes('grep') || name.includes('glob') || name.includes('ripgrep')) return 'search'
  if (name.includes('fetch')) return 'fetch'
  if (name.includes('browser') || name.includes('page') || name.includes('snapshot')) return 'browser'
  if (name.includes('workspace') || name.includes('save')) return 'workspace'
  return 'generic'
}

// family → ch-* chip 类 (原型角色色系)。read=blu, bash=ok, edit=warn, write=pur, 其余=think(ac)。
function chipClass(family: ToolFamily): string {
  if (family === 'read') return 'v6-chip--read'
  if (family === 'bash') return 'v6-chip--bash'
  if (family === 'edit') return 'v6-chip--edit'
  if (family === 'write') return 'v6-chip--write'
  return 'v6-chip--agent'
}

// chip 文本 = 工具能力名 (原型用 Read/Bash/Edit)
function chipLabel(tool: AssistantToolEvent, family: ToolFamily): string {
  if (family === 'read') return 'Read'
  if (family === 'bash') return 'Bash'
  if (family === 'edit') return 'Edit'
  if (family === 'write') return 'Write'
  if (family === 'search') return 'Search'
  if (family === 'fetch') return 'Fetch'
  if (family === 'browser') return 'Browser'
  if (family === 'todo') return 'Todo'
  if (family === 'workspace') return 'Save'
  return tool.name.slice(0, 12)
}

function toolPath(tool: AssistantToolEvent, family: ToolFamily): string {
  const input = (tool.input ?? {}) as Record<string, unknown>
  if (family === 'bash') {
    // claude Bash → {command:string}; codex exec_command → {command:string[]};
    // write_stdin → no command (process stdin). Join arrays so it reads as a line.
    const cmd = input.command ?? input.cmd ?? input.script
    const text = Array.isArray(cmd) ? cmd.join(' ') : String(cmd ?? '')
    return text
  }
  if (family === 'read' || family === 'write' || family === 'edit') return String(input.path ?? input.file_path ?? '')
  if (family === 'search') return String(input.query ?? input.pattern ?? '')
  if (family === 'fetch') return String(input.url ?? '')
  if (family === 'browser') return String(input.query ?? input.chunk_id ?? input.scope ?? '')
  return tool.name
}

async function copyToolValue(tool: AssistantToolEvent): Promise<void> {
  const value = toolPath(tool, toolFamily(tool))
  if (!value) return
  if (!await copyTextToClipboard(value)) return
  copiedToolId.value = tool.id
  window.setTimeout(() => {
    if (copiedToolId.value === tool.id) copiedToolId.value = null
  }, 1200)
}

function toggleToolValue(tool: AssistantToolEvent): void {
  if (expandedToolIds.has(tool.id)) expandedToolIds.delete(tool.id)
  else expandedToolIds.add(tool.id)
}

function toolState(tool: AssistantToolEvent): 'error' | 'running' | 'done' {
  if (tool.is_error) return 'error'
  // CHG-015 P8: a tool is done when its result frame arrived (tool.done) — NOT merely
  // when output text exists. The backend omits empty `output` (omitempty), so keying
  // off output presence kept empty-success tools spinning forever. `output` defined
  // still implies done (history / legacy frames that carry output but no done flag).
  if (tool.done || tool.output !== undefined) return 'done'
  return 'running'
}

// 头部摘要: N 个文件 · M 条命令 (按 family 聚类)
function headSummary(): string {
  const files = props.block.tools.filter(t => ['read', 'write', 'edit'].includes(toolFamily(t))).length
  const cmds = props.block.tools.filter(t => toolFamily(t) === 'bash').length
  const other = props.block.tools.length - files - cmds
  const parts: string[] = []
  if (files) parts.push(`${files} 个文件`)
  if (cmds) parts.push(`${cmds} 条命令`)
  if (other && !parts.length) parts.push(`${props.block.tools.length} 项操作`)
  else if (other) parts.push(`${other} 项其他`)
  return parts.join(' · ')
}

// CHG-015 P8: group spins while ANY tool is still running — i.e. not yet settled by a
// result frame (tool.done) AND no output AND not errored. Mirrors toolState's done test
// so the header spinner stops the instant the last tool's result lands.
const running = () => props.block.tools.some(t => !t.done && t.output === undefined && !t.is_error)
</script>

<template>
  <div
    v-if="props.block.tools.length"
    class="v6-xpill"
    :class="{ 'v6-xpill--open': open }"
    data-testid="assistant-tool-group"
  >
    <button
      type="button"
      class="v6-xh"
      :aria-expanded="open"
      :aria-controls="bodyId"
      @click="open = !open"
    >
      <span>{{ running() ? '探索中' : '已探索' }}</span>
      <span class="v6-xn">{{ headSummary() }}</span>
      <span v-if="running()" class="v6-xspin" />
      <span class="v6-bchev">▶</span>
    </button>
    <div v-if="open" :id="bodyId" class="v6-xb">
      <div class="v6-nest">
        <div
          v-for="tool in props.block.tools"
          :key="tool.id"
          class="v6-sbl"
          :class="[`v6-sbl--${toolState(tool)}`, { 'is-value-expanded': expandedToolIds.has(tool.id) }]"
          data-testid="assistant-tool-card"
        >
          <div class="v6-bh">
            <span class="v6-chip" :class="chipClass(toolFamily(tool))">{{ chipLabel(tool, toolFamily(tool)) }}</span>
            <button
              v-if="toolPath(tool, toolFamily(tool))"
              type="button"
              class="v6-bvalue"
              :class="{ 'is-expanded': expandedToolIds.has(tool.id) }"
              :aria-expanded="expandedToolIds.has(tool.id)"
              :aria-label="`${expandedToolIds.has(tool.id) ? '收起' : '展开'} ${chipLabel(tool, toolFamily(tool))} 完整详情`"
              :title="expandedToolIds.has(tool.id) ? '收起完整内容' : '展开完整内容'"
              @click="toggleToolValue(tool)"
            >
              <code class="v6-bpath">{{ toolPath(tool, toolFamily(tool)) }}</code>
              <span class="v6-bexpand" aria-hidden="true">{{ expandedToolIds.has(tool.id) ? '收起' : '展开' }}</span>
            </button>
            <button
              v-if="toolPath(tool, toolFamily(tool))"
              type="button"
              class="v6-bcopy"
              :class="{ 'is-copied': copiedToolId === tool.id }"
              aria-live="polite"
              :aria-label="`复制 ${chipLabel(tool, toolFamily(tool))} 详情`"
              :title="copiedToolId === tool.id ? '已复制' : '复制完整内容'"
              @click="copyToolValue(tool)"
            >{{ copiedToolId === tool.id ? '已复制' : '⧉' }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.v6-xpill {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin: 7px 0;
  overflow: hidden;
  box-sizing: border-box;
}
.v6-xh {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 12px;
  border: 1px solid var(--dw-bd);
  border-radius: 999px;
  background: var(--dw-sf);
  font: inherit;
  font-size: 11px;
  color: var(--dw-mu);
  cursor: pointer;
  user-select: none;
}
.v6-xh:hover { border-color: var(--dw-mu); color: var(--dw-fg); }
.v6-xh:focus-visible {
  outline: 2px solid var(--dw-ac);
  outline-offset: 2px;
}
.v6-xn { font-family: var(--dw-mono); font-size: 10px; }
.v6-xb { min-width: 0; max-width: 100%; margin-top: 7px; padding-left: 6px; box-sizing: border-box; }
.v6-nest {
  min-width: 0;
  max-width: 100%;
  padding: 4px 0 0 16px;
  border-left: 2px solid var(--dw-bd);
  margin-top: 6px;
  display: grid;
  gap: 4px;
}
.v6-sbl {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  box-sizing: border-box;
  border: 1px solid var(--dw-bd);
  background: var(--dw-sf);
  border-radius: var(--dw-r2);
}
.v6-sbl--running { border-color: var(--dw-ac-border-dim); }
.v6-sbl--error { border-color: var(--dw-red-border-dim); }
.v6-bh {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
}
.v6-chip {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 3px;
  font-family: var(--dw-mono);
  font-size: 10px;
  font-weight: 500;
  border: 1px solid var(--dw-bd);
  white-space: nowrap;
  flex-shrink: 0;
}
.v6-chip--read { color: var(--dw-blu); background: var(--dw-blu-dim); }
.v6-chip--bash { color: var(--dw-ok); background: var(--dw-ok-dim); }
.v6-chip--edit { color: var(--dw-warn); background: var(--dw-warn-surface-dim); }
.v6-chip--write { color: var(--dw-pur); background: var(--dw-pur-surface-dim); }
.v6-chip--agent { color: var(--dw-ac); background: var(--dw-ac-dim); }
.v6-bpath {
  font-family: var(--dw-mono);
  font-size: 11px;
  color: var(--dw-mu);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.v6-bvalue {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.v6-bvalue:hover .v6-bpath,
.v6-bvalue:focus-visible .v6-bpath { color: var(--dw-fg); }
.v6-bvalue:focus-visible { outline: 2px solid var(--dw-ac); outline-offset: 2px; border-radius: 3px; }
.v6-bvalue.is-expanded { align-items: flex-start; }
.v6-bvalue.is-expanded .v6-bpath {
  white-space: pre-wrap;
  overflow: visible;
  text-overflow: clip;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.v6-bexpand {
  flex-shrink: 0;
  color: var(--dw-ac);
  font-family: var(--dw-mono);
  font-size: 9px;
}
.v6-sbl.is-value-expanded .v6-bh {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
}
.v6-sbl.is-value-expanded .v6-chip { grid-column: 1; grid-row: 1; }
.v6-sbl.is-value-expanded .v6-bcopy { grid-column: 3; grid-row: 1; }
.v6-sbl.is-value-expanded .v6-bvalue {
  grid-column: 1 / -1;
  grid-row: 2;
  width: 100%;
  padding: 4px 0 2px;
}
.v6-bcopy {
  width: 24px; height: 24px; flex-shrink: 0; display: grid; place-items: center;
  border: 0; border-radius: 5px; background: transparent; color: var(--dw-mu);
  font-family: var(--dw-mono); font-size: 11px; cursor: pointer;
}
.v6-bcopy:hover, .v6-bcopy:focus-visible { color: var(--dw-fg); background: var(--dw-sf2); }
.v6-bcopy.is-copied {
  width: auto; min-width: 24px; padding: 0 7px;
  color: var(--dw-ok); background: var(--dw-ok-dim);
}
.v6-bchev {
  font-size: 9px;
  color: var(--dw-mu);
  margin-left: auto;
  transition: transform 0.15s;
}
.v6-xpill--open .v6-xh .v6-bchev { transform: rotate(90deg); }
.v6-xspin {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 2px solid var(--dw-ac-border-dim);
  border-top-color: var(--dw-ac);
  animation: v6-spin 0.9s linear infinite;
  flex-shrink: 0;
}
@keyframes v6-spin { to { transform: rotate(360deg); } }
</style>
