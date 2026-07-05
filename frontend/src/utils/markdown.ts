// Shared Markdown rendering — the single XSS-safe exit for Markdown → HTML across
// the workspace (deepwork-pro and deepwork-teamworkbench both consume this via the
// @ce alias). Lives in the shared frontend base so the sanitization contract has
// one source of truth.
//
// 契约: 任何把 marked 输出送进 `v-html` 的消费点必须经此函数。marked.parse 会原样
// 保留源文本里的 raw HTML (含 <script>/<img onerror>)，直接 v-html = 存储型 XSS。
// 此处用 DOMPurify 在 marked 之后统一净化。
import { marked } from 'marked'
import DOMPurify from 'dompurify'

// GFM: 表格/删除线/任务列表。breaks:true — 段落内单个换行 (`\n`) 渲染为 <br>，
// 否则 marked 会把软换行折成同一行 (字面不换行 bug)。块级结构 (标题/列表/引用/
// 段落空行 \n\n) 不受影响，仍正常成块。
marked.setOptions({ gfm: true, breaks: true })

/**
 * 将 Markdown 源渲染为「已净化」的 HTML 字符串，可安全用于 v-html。
 * - marked.parse 同步模式 (async:false) → string
 * - DOMPurify 移除 <script>/on* 事件处理器/javascript: 等危险节点与属性
 */
export function renderMarkdown(content: string): string {
  if (!content) return ''
  const raw = marked.parse(content, { async: false }) as string
  return DOMPurify.sanitize(raw, {
    // 允许 target=_blank 等正常锚点; DOMPurify 默认即剥离 on*/script/iframe 等。
    ADD_ATTR: ['target', 'rel'],
  })
}
