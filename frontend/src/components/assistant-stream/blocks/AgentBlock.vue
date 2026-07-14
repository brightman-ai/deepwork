<script lang="ts">
// 模块级唯一 id 计数（折叠头 ↔ 内容 a11y 关联）。
let agentSeq = 0
</script>

<script setup lang="ts">
// CHG-014 Runtime-SSOT P2 — subagent 子流块 (关键 gap 补齐)。
// 对照原型 ch-agent (deepwork-v6.html 行 1104): ⑂fork + 琥珀 chip「Agent · {type}」
// + bdesc 描述 + 嵌套 inner blocks 子流。**agent 子流一等公民, 不卷收** —— 默认展开,
// 左侧 amber 竖线 (nest) + 缩进表示子 agent 独立执行域。children 递归经 blockRegistry
// 同源渲染 (text 内联 v-html, 余者 resolve component)，故再嵌套的 agent/tool/thinking
// 层级保真。agent-team = 同一轮多个并列 AgentBlock (surface 顺序渲染即并列)。
import { ref, computed } from 'vue'
import { marked } from 'marked'
import type { AssistantAgentBlock, AssistantBlock } from '../types'
import { blockRegistry } from '../blockRegistry'

const props = defineProps<{
  block: AssistantAgentBlock
  streaming?: boolean
}>()

const bodyId = `as-agent-body-${++agentSeq}`
// Parent flow shows the dispatch as one compact event. The real child transcript is
// navigated as its own execution; expanding this block is an explicit inspection action.
const open = ref(false)

const children = computed<AssistantBlock[]>(() => props.block.children ?? [])
const hasChildren = computed(() => children.value.length > 0)

const label = computed(() => {
  const t = props.block.subagentType?.trim()
  return t ? `Agent · ${t}` : 'Agent'
})

// CHG-014 P3b (Gap-4): 子 agent 用量行 — 「↓in ↑out · {dur}」。
// 数据诚实: 缺则渲染「—」(claude 不内联子 agent usage → tokens 常缺;
// duration 由后端 tool_use→tool_result 时间差推导, 通常有真值)。
function fmtTok(n?: number): string {
  if (n == null || n < 0) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(n)
}
function fmtDur(ms?: number): string {
  if (ms == null || ms <= 0) return '—'
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`
  const m = Math.floor(s / 60)
  return `${m}m${Math.round(s % 60)}s`
}
const usage = computed(() => {
  const b = props.block
  const hasAny = b.inTokens != null || b.outTokens != null || b.durationMs != null
  if (!hasAny) return null
  return {
    inTok: fmtTok(b.inTokens),
    outTok: fmtTok(b.outTokens),
    dur: fmtDur(b.durationMs),
  }
})

// children 含 text → 内联 markdown (与 surface 一致); 余者 → blockRegistry component。
function isText(b: AssistantBlock): b is { type: 'text'; content: string } {
  return b.type === 'text'
}
function resolveChild(type: string) {
  return blockRegistry.resolve(type) ?? null
}
function renderMd(raw: string): string {
  if (!raw) return ''
  return marked.parse(raw, { async: false }) as string
}
const resultHtml = computed(() => (props.block.result ? renderMd(props.block.result) : ''))
</script>

<template>
  <div
    class="as-agent"
    :class="{ 'as-agent--error': props.block.isError, 'as-agent--open': open }"
    data-testid="assistant-agent-block"
  >
    <button
      type="button"
      class="as-agent__head"
      :aria-expanded="open"
      :aria-controls="bodyId"
      @click="open = !open"
    >
      <span class="as-agent__fork" aria-hidden="true">⑂</span>
      <span class="as-agent__chip">{{ label }}</span>
      <span v-if="props.block.description" class="as-agent__desc">{{ props.block.description }}</span>
      <!-- 子 agent 用量行 (CHG-014 P3b): ↓in ↑out · 耗时; 缺则「—」(诚实降级)。 -->
      <span v-if="usage" class="as-agent__usage" title="子 agent 用量 / 耗时">
        <span class="as-agent__um">↓{{ usage.inTok }}</span>
        <span class="as-agent__um">↑{{ usage.outTok }}</span>
        <span class="as-agent__um">· {{ usage.dur }}</span>
      </span>
      <span class="as-agent__chev" aria-hidden="true">▶</span>
    </button>

    <!-- 子流: amber 竖线 + 缩进 = 子 agent 执行域 (nest, 原型 .nest)。 -->
    <div v-if="open" :id="bodyId" class="as-agent__body">
      <div class="as-agent__nest">
        <template v-if="hasChildren">
          <div
            v-for="(child, i) in children"
            :key="`${bodyId}-${i}`"
            class="as-agent__child"
          >
            <div
              v-if="isText(child)"
              class="as-block as-block--text"
              v-html="renderMd(child.content)"
            />
            <component
              :is="resolveChild(child.type)"
              v-else-if="resolveChild(child.type)"
              :block="child"
              :streaming="false"
            />
          </div>
        </template>
        <!-- children 为空 (claude sidechain 未内联) → 至少展示派发上下文 + 结果摘要,
             保证 subagent 不塌成空块。 -->
        <div v-else class="as-agent__meta">
          <details v-if="props.block.prompt" class="as-agent__prompt-details">
            <summary>查看派发指令</summary>
            <p class="as-agent__prompt">{{ props.block.prompt }}</p>
          </details>
          <div v-if="resultHtml" class="as-block as-block--text" v-html="resultHtml" />
          <p v-if="!props.block.prompt && !resultHtml" class="as-agent__empty">
            子 agent 已派发（{{ label }}）—— 子流明细在该 subagent 自身 transcript。
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.as-agent { margin: 7px 0; }
.as-agent__head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--dw-ac-border-dim, var(--dw-bd));
  border-radius: var(--dw-r2, 7px);
  background: var(--dw-ac-dim);
  font: inherit;
  text-align: left;
  cursor: pointer;
  user-select: none;
}
.as-agent--error .as-agent__head {
  border-color: var(--dw-red-border-dim, var(--dw-bd));
  background: var(--dw-red-dim, var(--dw-ac-dim));
}
.as-agent__head:focus-visible { outline: 2px solid var(--dw-ac); outline-offset: 2px; }
.as-agent__fork { color: var(--dw-ac); font-size: 12px; flex-shrink: 0; }
.as-agent__chip {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 3px;
  font-family: var(--dw-mono);
  font-size: 10px;
  font-weight: 500;
  color: var(--dw-ac);
  background: var(--dw-ac-dim);
  border: 1px solid var(--dw-ac-border-dim, var(--dw-bd));
  white-space: nowrap;
  flex-shrink: 0;
}
.as-agent__desc {
  font-size: 12px;
  color: var(--dw-mu);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
/* 子 agent 用量 chips — mono, 右侧, 紧凑。缺值显「—」由组件计算。 */
.as-agent__usage {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  flex-shrink: 0;
  font-family: var(--dw-mono);
  font-size: 10px;
  color: var(--dw-mu);
}
.as-agent__um { white-space: nowrap; }
.as-agent__chev {
  font-size: 9px;
  color: var(--dw-mu);
  margin-left: 8px;
  transition: transform 0.15s;
  flex-shrink: 0;
}
.as-agent--open .as-agent__chev { transform: rotate(90deg); }
/* nest: 左 amber 竖线 + 缩进 = 子 agent 执行域 (原型 .nest, amber 强调子流身份)。 */
.as-agent__body { margin-top: 6px; }
.as-agent__nest {
  padding: 4px 0 4px 14px;
  border-left: 2px solid var(--dw-ac-border-dim, var(--dw-ac));
  display: grid;
  gap: 4px;
}
.as-agent__child { display: contents; }
.as-agent__meta { display: grid; gap: 6px; }
.as-agent__prompt-details { color: var(--dw-mu); font-size: 11px; }
.as-agent__prompt-details summary { cursor: pointer; user-select: none; }
.as-agent__prompt {
  font-size: 12px;
  color: var(--dw-mu);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 0;
  max-height: 7.5em;
  overflow: hidden;
}
.as-agent__empty { font-size: 12px; color: var(--dw-mu); margin: 0; }
</style>
