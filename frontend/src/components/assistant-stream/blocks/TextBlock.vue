<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import type { AssistantBlock } from '../types'

// 接收完整的 text block，与其他 block 保持一致的接口形状
const props = defineProps<{
  block: Extract<AssistantBlock, { type: 'text' }>
  streaming?: boolean
}>()

// 将 Markdown 渲染为 HTML；marked 同步模式直接返回 string
const html = computed(() => {
  const raw = props.block.content
  if (!raw) return ''
  return marked.parse(raw, { async: false }) as string
})
</script>

<template>
  <div
    class="as-block as-block--text tb-prose"
    :class="{ 'tb-prose--streaming': props.streaming }"
    data-testid="assistant-text-block"
    v-html="html"
  />
</template>

<style scoped>
/* 基础行文排版 */
.tb-prose {
  line-height: 1.65;
  overflow-wrap: anywhere;
  font-size: 13.5px;
  color: inherit;
}

/* 段落间距 */
.tb-prose :deep(p) {
  margin: 0 0 0.75em;
}

.tb-prose :deep(p:last-child) {
  margin-bottom: 0;
}

/* 标题层级 */
.tb-prose :deep(h1),
.tb-prose :deep(h2),
.tb-prose :deep(h3),
.tb-prose :deep(h4) {
  font-weight: 700;
  line-height: 1.3;
  margin: 1em 0 0.4em;
}

.tb-prose :deep(h1) { font-size: 1.3em; }
.tb-prose :deep(h2) { font-size: 1.15em; }
.tb-prose :deep(h3) { font-size: 1.05em; }
.tb-prose :deep(h4) { font-size: 0.95em; }

/* 粗体 / 斜体 */
.tb-prose :deep(strong) { font-weight: 700; }
.tb-prose :deep(em) { font-style: italic; }

/* 行内代码 — CHG-014 V3-D: v6 tokenization (was hardcoded light) */
.tb-prose :deep(code) {
  border-radius: 4px;
  padding: 1px 4px;
  background: var(--dw-sf2);
  color: var(--dw-fg);
  font-family: var(--dw-mono);
  font-size: 0.88em;
}

/* 代码块 */
.tb-prose :deep(pre) {
  margin: 6px 0;
  padding: 8px 10px;
  border-radius: 7px;
  background: var(--dw-sf);
  border: 1px solid var(--dw-bd);
  color: var(--dw-fg);
  overflow-x: auto;
}

.tb-prose :deep(pre code) {
  background: transparent;
  padding: 0;
  font-size: 0.85em;
  color: inherit;
}

/* 有序 / 无序列表 */
.tb-prose :deep(ul),
.tb-prose :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.5em;
}

.tb-prose :deep(li) {
  margin: 0.2em 0;
}

/* 链接 — v6 reserves blue for links/unread */
.tb-prose :deep(a) {
  color: var(--dw-blu);
  text-decoration: underline;
}

.tb-prose :deep(a:hover) {
  color: var(--dw-blu);
  opacity: 0.85;
}

/* 引用块 */
.tb-prose :deep(blockquote) {
  border-left: 3px solid var(--dw-bd);
  margin: 0.5em 0;
  padding: 4px 12px;
  color: var(--dw-mu);
}

/* 流式输出时光标动画 — amber accent cursor (single accent) */
.tb-prose--streaming::after {
  content: '▍';
  display: inline-block;
  color: var(--dw-ac);
  animation: tb-blink 0.9s step-end infinite;
}

@keyframes tb-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
</style>
