<script setup lang="ts">
/**
 * FilePreview — READ-ONLY format-aware text viewer for FilePanel.
 *   · markdown (.md)   → rich HTML via `marked`, SANITIZED with DOMPurify
 *   · code (.go/.ts/…) → syntax-highlighted via highlight.js (lazy-loaded, curated langs)
 *   · plain            → monospace text
 *
 * Security: unlike the terminal's local-files-only origin, FilePanel is also mounted in
 * the SHARE visitor view where the content is ANOTHER user's file — so marked HTML is run
 * through DOMPurify before v-html (untrusted-file markdown must never XSS the viewer). A 换行 toggle covers
 * code/plain. Images/binaries/oversized files are handled by the FilePanel host, not here.
 */
import { ref, computed, watch } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { WrapText } from 'lucide-vue-next'
import type { LanguageFn } from 'highlight.js'

const props = defineProps<{ name: string; text: string }>()

// extension → highlight.js language id (toml/ini/env share the ini grammar).
const EXT_LANG: Record<string, string> = {
  go: 'go', ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', vue: 'xml',
  py: 'python', rs: 'rust', rb: 'ruby', java: 'java', kt: 'kotlin', swift: 'swift',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'ini', ini: 'ini', conf: 'ini', env: 'ini',
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',
  html: 'xml', xml: 'xml', svg: 'xml', css: 'css', scss: 'css', less: 'css',
  sql: 'sql', dockerfile: 'dockerfile', diff: 'diff', patch: 'diff', lua: 'lua', proto: 'protobuf',
}

const ext = computed(() => {
  const base = props.name.split('/').pop() || props.name
  if (base.toLowerCase() === 'dockerfile') return 'dockerfile'
  const parts = base.split('.')
  return parts.length > 1 ? (parts.pop() || '').toLowerCase() : ''
})
const lang = computed(() => EXT_LANG[ext.value] || '')
const kind = computed<'markdown' | 'code' | 'plain'>(() => {
  if (['md', 'markdown', 'mdx'].includes(ext.value)) return 'markdown'
  return lang.value ? 'code' : 'plain'
})

const wrap = ref(true)

// marked → DOMPurify (untrusted-file safe). Sanitize even though most files are trusted:
// the share view renders another user's markdown into the visitor's browser.
const mdHtml = computed(() =>
  kind.value === 'markdown'
    ? DOMPurify.sanitize(marked.parse(props.text, { async: false }) as string)
    : '',
)

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Lazy highlight.js: core + curated language set, loaded once on the first code preview.
let hljsPromise: Promise<typeof import('highlight.js/lib/core').default> | null = null
function loadHljs() {
  if (!hljsPromise) {
    hljsPromise = (async () => {
      const core = (await import('highlight.js/lib/core')).default
      const reg = async (id: string, imp: Promise<{ default: LanguageFn }>) =>
        core.registerLanguage(id, (await imp).default)
      await Promise.all([
        reg('go', import('highlight.js/lib/languages/go')),
        reg('typescript', import('highlight.js/lib/languages/typescript')),
        reg('javascript', import('highlight.js/lib/languages/javascript')),
        reg('python', import('highlight.js/lib/languages/python')),
        reg('rust', import('highlight.js/lib/languages/rust')),
        reg('json', import('highlight.js/lib/languages/json')),
        reg('yaml', import('highlight.js/lib/languages/yaml')),
        reg('ini', import('highlight.js/lib/languages/ini')),
        reg('bash', import('highlight.js/lib/languages/bash')),
        reg('xml', import('highlight.js/lib/languages/xml')),
        reg('css', import('highlight.js/lib/languages/css')),
        reg('sql', import('highlight.js/lib/languages/sql')),
        reg('markdown', import('highlight.js/lib/languages/markdown')),
        reg('dockerfile', import('highlight.js/lib/languages/dockerfile')),
        reg('diff', import('highlight.js/lib/languages/diff')),
        reg('ruby', import('highlight.js/lib/languages/ruby')),
        reg('java', import('highlight.js/lib/languages/java')),
        reg('c', import('highlight.js/lib/languages/c')),
        reg('cpp', import('highlight.js/lib/languages/cpp')),
      ])
      return core
    })()
  }
  return hljsPromise
}

const codeHtml = ref('')
watch(
  [() => props.text, () => props.name],
  async () => {
    if (kind.value !== 'code') { codeHtml.value = ''; return }
    codeHtml.value = escapeHtml(props.text) // instant, unhighlighted — replaced once hljs loads
    const want = props.text
    try {
      const hljs = await loadHljs()
      if (props.text !== want) return // a newer preview superseded this one
      if (lang.value && hljs.getLanguage(lang.value)) {
        codeHtml.value = hljs.highlight(props.text, { language: lang.value, ignoreIllegals: true }).value
      }
    } catch { /* keep the escaped plain text */ }
  },
  { immediate: true },
)
</script>

<template>
  <div class="filepreview" data-testid="file-preview">
    <button
      class="fp-wrap-toggle"
      :class="{ 'is-on': wrap }"
      type="button"
      :title="wrap ? '关闭自动换行' : '自动换行'"
      data-testid="file-preview-wrap"
      @click="wrap = !wrap"
    >
      <WrapText class="fp-wrap-ic" />
    </button>

    <div v-if="kind === 'markdown'" class="fp-md" :class="wrap ? 'fp-md-wrap' : 'fp-md-nowrap'" v-html="mdHtml" />
    <pre v-else class="fp-code hljs" :class="wrap ? 'fp-wrap' : 'fp-nowrap'"><code v-html="codeHtml" /></pre>
  </div>
</template>

<style scoped>
.filepreview {
  position: relative; height: 100%; overflow: auto;
  background: #0e0b16; color: #e6e1f0;
  -webkit-user-select: text; user-select: text;
}
.filepreview :deep(.fp-md), .filepreview :deep(.fp-code),
.filepreview :deep(.fp-md *), .filepreview :deep(.fp-code *) { -webkit-user-select: text; user-select: text; }

.fp-wrap-toggle {
  position: absolute; top: 6px; right: 8px; z-index: 2;
  display: inline-flex; align-items: center; justify-content: center; padding: 3px; border-radius: 6px;
  color: #9d97b5; background: rgba(14, 11, 22, 0.9); border: 1px solid #2b2640; cursor: pointer;
}
.fp-wrap-toggle.is-on { color: #c8a8ff; border-color: #4a3f70; }
.fp-wrap-ic { width: 14px; height: 14px; }

.fp-code {
  margin: 0; padding: 12px 12px 28px;
  font-family: 'Cascadia Code', 'Fira Code', 'SF Mono', ui-monospace, monospace;
  font-size: 0.72rem; line-height: 1.6; color: #e6e1f0; background: transparent; tab-size: 4;
}
.fp-wrap { white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; }
.fp-nowrap { white-space: pre; overflow-x: auto; }

.fp-code :deep(.hljs-comment), .fp-code :deep(.hljs-quote) { color: #8b93a7; font-style: italic; }
.fp-code :deep(.hljs-keyword), .fp-code :deep(.hljs-selector-tag), .fp-code :deep(.hljs-doctag) { color: #ff7b9c; }
.fp-code :deep(.hljs-literal), .fp-code :deep(.hljs-number), .fp-code :deep(.hljs-symbol),
.fp-code :deep(.hljs-bullet) { color: #ffab70; }
.fp-code :deep(.hljs-string), .fp-code :deep(.hljs-regexp), .fp-code :deep(.hljs-addition) { color: #9ae6b4; }
.fp-code :deep(.hljs-title), .fp-code :deep(.hljs-title.function_), .fp-code :deep(.hljs-section) { color: #c8a8ff; }
.fp-code :deep(.hljs-built_in), .fp-code :deep(.hljs-type), .fp-code :deep(.hljs-class .hljs-title) { color: #ffd866; }
.fp-code :deep(.hljs-name), .fp-code :deep(.hljs-tag) { color: #7ee787; }
.fp-code :deep(.hljs-attr), .fp-code :deep(.hljs-attribute), .fp-code :deep(.hljs-variable),
.fp-code :deep(.hljs-template-variable) { color: #79c0ff; }
.fp-code :deep(.hljs-meta) { color: #a9a3c2; }
.fp-code :deep(.hljs-deletion) { color: #ff9c9c; }
.fp-code :deep(.hljs-emphasis) { font-style: italic; }
.fp-code :deep(.hljs-strong) { font-weight: 700; }

.fp-md { padding: 14px 16px 28px; font-size: 0.78rem; line-height: 1.65; color: #d9d4e6; word-break: break-word; overflow-wrap: anywhere; }
.fp-md :deep(h1), .fp-md :deep(h2), .fp-md :deep(h3) { color: #fff; font-weight: 700; line-height: 1.3; margin: 1em 0 0.45em; }
.fp-md :deep(h1) { font-size: 1.2rem; border-bottom: 1px solid #2b2640; padding-bottom: 0.25em; }
.fp-md :deep(h2) { font-size: 1.08rem; border-bottom: 1px solid #221d33; padding-bottom: 0.2em; }
.fp-md :deep(h3) { font-size: 0.98rem; }
.fp-md :deep(h4), .fp-md :deep(h5), .fp-md :deep(h6) { color: #d8d2ea; font-weight: 600; margin: 0.85em 0 0.3em; }
.fp-md :deep(p) { margin: 0.55em 0; }
.fp-md :deep(a) { color: #79b8ff; text-decoration: none; }
.fp-md :deep(a:hover) { text-decoration: underline; }
.fp-md :deep(ul), .fp-md :deep(ol) { margin: 0.55em 0; padding-left: 1.5em; }
.fp-md :deep(li) { margin: 0.25em 0; }
.fp-md :deep(li::marker) { color: #8b7fb0; }
.fp-md :deep(strong) { color: #fff; font-weight: 700; }
.fp-md :deep(em) { font-style: italic; }
.fp-md :deep(code) {
  font-family: 'Cascadia Code', 'Fira Code', 'SF Mono', ui-monospace, monospace;
  font-size: 0.9em; background: rgba(140, 130, 180, 0.18); color: #f0d8ff; padding: 0.1em 0.4em; border-radius: 5px;
}
.fp-md :deep(pre) { background: #07060c; border: 1px solid #221d33; border-radius: 8px; padding: 11px 13px; overflow-x: auto; margin: 0.7em 0; }
.fp-md :deep(pre code) { background: none; padding: 0; color: #e6e1f0; font-size: 0.72rem; line-height: 1.55; }
.fp-md-wrap :deep(pre) { white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; overflow-x: visible; }
.fp-md-nowrap :deep(pre) { white-space: pre; overflow-x: auto; }
.fp-md :deep(blockquote) { border-left: 3px solid #6a5aa0; margin: 0.7em 0; padding: 0.15em 0 0.15em 0.9em; color: #b8b2cc; }
.fp-md :deep(table) { border-collapse: collapse; margin: 0.7em 0; font-size: 0.9em; display: block; overflow-x: auto; }
.fp-md :deep(th), .fp-md :deep(td) { border: 1px solid #2b2640; padding: 5px 9px; text-align: left; }
.fp-md :deep(th) { background: rgba(140, 130, 180, 0.12); color: #fff; font-weight: 600; }
.fp-md :deep(hr) { border: none; border-top: 1px solid #2b2640; margin: 1.1em 0; }
.fp-md :deep(img) { max-width: 100%; border-radius: 6px; }
</style>
