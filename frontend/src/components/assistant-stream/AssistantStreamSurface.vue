<template>
  <section
    class="as-stream as-pane"
    :class="[`as-pane--${density}`, { 'as-pane--readonly': readonly }]"
    data-testid="assistant-stream-view"
  >
    <header v-if="showHeader" class="as-pane__header">
      <div class="as-pane__title-group">
        <span v-if="eyebrow" class="as-pane__eyebrow">{{ eyebrow }}</span>
        <div class="as-pane__title-row">
          <strong class="as-pane__title">{{ title }}</strong>
          <span v-if="sessionId" class="as-pane__session">#{{ sessionId }}</span>
        </div>
      </div>
      <div v-if="statusLabel || $slots.headerActions" class="as-pane__header-actions">
        <span v-if="statusLabel" class="as-pane__state" :class="`as-pane__state--${statusTone}`">
          {{ statusLabel }}
        </span>
        <slot name="headerActions" />
      </div>
    </header>

    <div v-if="contextItems.length" class="as-pane__context" data-testid="assistant-context-header">
      <span
        v-for="item in contextItems"
        :key="`${item.label}-${item.value}`"
        class="as-pane__context-chip"
        :class="`as-pane__context-chip--${item.tone || 'default'}`"
      >
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </span>
    </div>

    <div ref="timelineRef" class="as-pane__timeline" role="log" aria-live="polite" aria-label="消息时间线" data-testid="assistant-timeline" @scroll="handleScroll">
      <div v-if="!messages.length && !streaming" class="as-pane__empty" data-testid="assistant-empty">
        <div class="as-pane__empty-title">{{ emptyTitle }}</div>
        <p>{{ emptyHint }}</p>
        <div v-if="launcherItems.length" class="as-pane__examples">
          <button
            v-for="item in launcherItems.slice(0, 4)"
            :key="item.id"
            class="as-pane__example"
            type="button"
            @click="applyLauncherItem(item)"
          >
            <span class="as-pane__example-label">{{ item.label }}</span>
            <span v-if="item.description" class="as-pane__example-desc">{{ item.description }}</span>
          </button>
        </div>
      </div>

      <div
        v-for="(message, index) in messages"
        :key="message.id"
        class="as-message"
        :class="[`as-message--${message.role}`, { 'as-message--failed': message.status === 'failed' }]"
        :data-testid="`assistant-message-${message.role}`"
      >
        <div v-if="message.role !== 'user'" class="as-message__avatar" aria-hidden="true">
          {{ message.role === 'system' ? '!' : 'AI' }}
        </div>
        <div class="as-message__body">
          <div v-if="message.role === 'user'" class="as-message__user-bubble">{{ message.content }}</div>
          <template v-else>
            <template
              v-for="(block, blockIndex) in blocksForMessage(message)"
              :key="`${message.id}-${blockIndex}`"
            >
              <div
                v-if="block.type === 'text'"
                class="as-block as-block--text"
                v-html="renderMarkdown(block.content)"
              />
              <component
                :is="resolveBlockComponent(block.type)"
                v-else
                :block="block"
                :streaming="message.streaming || (streaming && index === messages.length - 1)"
              />
            </template>
            <slot
              v-if="message.role === 'assistant'"
              name="assistantActions"
              :message="message"
              :index="index"
            />
            <UsageFooter
              v-if="message.role === 'assistant' && shouldShowFooter(message)"
              :message="message"
              :streaming="message.streaming || (streaming && index === messages.length - 1)"
            />
          </template>
        </div>
      </div>

      <div v-if="streaming && !hasLiveAssistantMessage" class="as-message as-message--assistant" data-testid="assistant-streaming-message">
        <div class="as-message__avatar" aria-hidden="true">AI</div>
        <div class="as-message__body">
          <WaitingBlock
            v-if="!streamingContent"
            :block="{ type: 'waiting', status: waitingStatus, startedAt: streamingStartedAt }"
            :streaming="true"
          />
          <div
            v-else
            class="as-block as-block--text"
            v-html="renderMarkdown(streamingContent)"
          />
        </div>
      </div>

      <button
        v-if="showScrollButton"
        type="button"
        class="as-pane__scroll"
        data-testid="assistant-scroll-bottom"
        @click="scrollToBottom(true)"
      >
        ↓
      </button>
    </div>

    <div v-if="error" class="as-pane__error" data-testid="assistant-error">
      <span>{{ error }}</span>
      <button type="button" @click="emit('clear-error')">×</button>
    </div>

    <footer v-if="!readonly" class="as-pane__composer">
      <slot name="composerPrefix" />
      <div v-if="launcherItems.length || composerMeta" class="as-pane__composer-meta">
        <button
          v-if="launcherItems.length"
          type="button"
          class="as-pane__meta-btn"
          @click="launcherOpen = !launcherOpen"
        >
          +
        </button>
        <span v-if="composerMeta">{{ composerMeta }}</span>
      </div>
      <div class="as-composer">
        <textarea
          ref="textareaRef"
          v-model="draft"
          class="as-composer__input"
          :placeholder="placeholder"
          :disabled="disabled || streaming"
          rows="1"
          aria-label="消息输入"
          data-testid="assistant-composer-input"
          @input="resizeComposer"
          @keydown.enter.exact.prevent="submit"
        />
        <button
          type="button"
          class="as-composer__send"
          :disabled="!canSend"
          data-testid="assistant-composer-send"
          @click="submit"
        >
          {{ streaming ? '...' : sendLabel }}
        </button>
      </div>
      <div v-if="launcherOpen && launcherItems.length" class="as-pane__launcher">
        <button
          v-for="item in launcherItems"
          :key="item.id"
          type="button"
          class="as-pane__launcher-item"
          @click="applyLauncherItem(item)"
        >
          <strong>{{ item.label }}</strong>
          <span v-if="item.description">{{ item.description }}</span>
        </button>
      </div>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type {
  AssistantBlock,
  AssistantContextItem,
  AssistantDensity,
  AssistantLauncherItem,
  AssistantMessage,
} from './types'
import { blockRegistry } from './blockRegistry'
import {
  ThinkingBlock,
  ToolGroupBlock,
  TaskPlanBlock,
  WaitingBlock,
  PermissionBlock,
  ErrorBlock,
  UsageFooter,
} from './blocks'

const props = withDefaults(defineProps<{
  messages?: AssistantMessage[]
  sessionId?: number | null
  title?: string
  eyebrow?: string
  statusLabel?: string
  statusTone?: 'idle' | 'ready' | 'active' | 'pending' | 'error'
  contextItems?: AssistantContextItem[]
  launcherItems?: AssistantLauncherItem[]
  emptyTitle?: string
  emptyHint?: string
  placeholder?: string
  composerMeta?: string
  sendLabel?: string
  streaming?: boolean
  streamingContent?: string
  streamingStartedAt?: number
  waitingStatus?: string
  error?: string
  disabled?: boolean
  readonly?: boolean
  density?: AssistantDensity
  showHeader?: boolean
}>(), {
  messages: () => [],
  sessionId: null,
  title: '会话',
  eyebrow: '',
  statusLabel: '',
  statusTone: 'idle',
  contextItems: () => [],
  launcherItems: () => [],
  emptyTitle: '开始对话',
  emptyHint: '输入问题，AI 会在这里展示过程和结果。',
  placeholder: '输入消息...',
  composerMeta: '',
  sendLabel: '发送',
  streaming: false,
  streamingContent: '',
  streamingStartedAt: 0,
  waitingStatus: '生成中',
  error: '',
  disabled: false,
  readonly: false,
  density: 'full',
  showHeader: true,
})

const emit = defineEmits<{
  (e: 'send', text: string): void
  (e: 'clear-error'): void
}>()

const draft = ref('')
const launcherOpen = ref(false)
const timelineRef = ref<HTMLDivElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const autoScroll = ref(true)
const showScrollButton = ref(false)

const contextItems = computed(() => props.contextItems ?? [])
const launcherItems = computed(() => props.launcherItems ?? [])
const canSend = computed(() => !props.disabled && !props.streaming && draft.value.trim().length > 0)
const hasLiveAssistantMessage = computed(() => {
  const last = props.messages[props.messages.length - 1]
  return Boolean(
    props.streaming &&
    last?.role === 'assistant' &&
    (last.streaming || last.blocks?.length || last.content),
  )
})

watch(
  () => [props.messages.length, props.streamingContent, props.streaming] as const,
  () => nextTick(() => scrollToBottom(false)),
)

watch(
  () => props.messages,
  () => nextTick(() => scrollToBottom(false)),
  { deep: true },
)

onMounted(() => {
  resizeComposer()
})

function blocksForMessage(message: AssistantMessage): AssistantBlock[] {
  if (message.blocks?.length) return message.blocks
  if (message.status === 'failed' && message.error) return [{ type: 'error', message: message.error }]
  if (message.content) return [{ type: 'text', content: message.content }]
  return []
}

function shouldShowFooter(message: AssistantMessage): boolean {
  return Boolean(message.streaming || message.usage || message.live_usage || message.elapsed_ms)
}

function submit(): void {
  const text = draft.value.trim()
  if (!text || !canSend.value) return
  draft.value = ''
  launcherOpen.value = false
  resizeComposer()
  emit('send', text)
}

function applyLauncherItem(item: AssistantLauncherItem): void {
  draft.value = draft.value ? `${draft.value}\n${item.insertText}` : item.insertText
  launcherOpen.value = false
  resizeComposer()
  nextTick(() => textareaRef.value?.focus())
}

function resizeComposer(): void {
  if (!textareaRef.value) return
  textareaRef.value.style.height = 'auto'
  textareaRef.value.style.height = `${Math.min(textareaRef.value.scrollHeight, 180)}px`
}

function isNearBottom(): boolean {
  const el = timelineRef.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight <= 96
}

function handleScroll(): void {
  autoScroll.value = isNearBottom()
  showScrollButton.value = !autoScroll.value
}

async function scrollToBottom(force = false): Promise<void> {
  await nextTick()
  const el = timelineRef.value
  if (!el) return
  if (!force && !autoScroll.value) return
  el.scrollTop = el.scrollHeight
  autoScroll.value = true
  showScrollButton.value = false
}

defineExpose({
  setDraft(text: string) {
    draft.value = text
    resizeComposer()
    nextTick(() => textareaRef.value?.focus())
  },
  focus() {
    textareaRef.value?.focus()
  },
  scrollToBottom,
})

// Resolves which block component to render for a given block type.
// Returns a component or null for 'text' blocks (handled inline via v-html).
// Uses blockRegistry so extension blocks registered via registerExtension() are
// automatically picked up without modifying this file.
function resolveBlockComponent(type: AssistantBlock['type']) {
  if (type === 'text') return null
  return blockRegistry.resolve(type) ?? null
}

// Keep named imports for potential direct use in subcomponents.
void ThinkingBlock, ToolGroupBlock, TaskPlanBlock, WaitingBlock, PermissionBlock, ErrorBlock, UsageFooter

function renderMarkdown(value: unknown): string {
  // Accepts unknown because the open AssistantExtensionBlock variant (CHG-013 D8)
  // widens text-block `content` to unknown at the call site; coerce defensively.
  const content = typeof value === 'string' ? value : value == null ? '' : String(value)
  if (!content) return ''
  let html = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  html = html.replace(/```([\s\S]*?)```/g, (_, block) => `<pre class="as-code"><code>${String(block).trim()}</code></pre>`)
  html = html.replace(/`([^`]+)`/g, '<code class="as-inline-code">$1</code>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/\n/g, '<br>')
  return html
}
</script>

<style scoped>
.as-pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: #fbfcfe;
  color: #172033;
}

.as-pane__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid #e5ebf3;
  flex-shrink: 0;
}

.as-pane__eyebrow {
  display: block;
  color: #69758a;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.as-pane__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.as-pane__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.as-pane__session,
.as-pane__state,
.as-pane__context-chip,
.as-pane__composer-meta span,
.as-badge {
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  background: #eef3f8;
  color: #526174;
}

.as-pane__header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.as-pane__state--active,
.as-pane__state--ready,
.as-badge--done {
  background: #e0f2e8;
  color: #12613a;
}

.as-pane__state--pending,
.as-badge--running {
  background: #e8edff;
  color: #2b46a0;
}

.as-pane__state--error,
.as-badge--error {
  background: #fee8e7;
  color: #a21d1d;
}

.as-pane__context {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding: 8px 12px;
  border-bottom: 1px solid #e9eef5;
  flex-shrink: 0;
}

.as-pane__context-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.as-pane__context-chip--warning {
  background: #fff4d6;
  color: #7b4b00;
}

.as-pane__context-chip--good {
  background: #e0f2e8;
  color: #12613a;
}

.as-pane__timeline {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px;
  position: relative;
}

.as-pane__empty {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  color: #66758c;
}

.as-pane__empty-title {
  color: #1f2937;
  font-weight: 750;
  font-size: 16px;
}

.as-pane__examples {
  display: grid;
  gap: 8px;
  margin-top: 8px;
}

.as-pane__example,
.as-pane__launcher-item {
  text-align: left;
  border: 1px solid #e3eaf3;
  background: #f5f8fc;
  border-radius: 8px;
  padding: 9px 10px;
  cursor: pointer;
}

.as-pane__example:hover,
.as-pane__launcher-item:hover {
  background: #edf3fa;
}

.as-pane__example-label,
.as-pane__launcher-item strong {
  display: block;
  color: #1f2937;
  font-weight: 700;
}

.as-pane__example-desc,
.as-pane__launcher-item span {
  display: block;
  color: #66758c;
  font-size: 12px;
  margin-top: 2px;
}

.as-message {
  display: flex;
  gap: 10px;
  padding: 10px 0;
}

.as-message + .as-message {
  border-top: 1px solid #eef2f6;
}

.as-message--user {
  justify-content: flex-end;
}

.as-message__avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #2563eb;
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.as-message__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.as-message__user-bubble {
  max-width: min(80%, 720px);
  padding: 8px 12px;
  border-radius: 16px 16px 4px 16px;
  background: #2563eb;
  color: #fff;
  white-space: pre-wrap;
}

.as-block {
  border-radius: 8px;
  font-size: 13.5px;
}

.as-block--text {
  line-height: 1.62;
  overflow-wrap: anywhere;
}

.as-block--waiting,
.as-tool,
.as-block--permission,
.as-block--error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid #e3eaf3;
  background: #f8fafd;
}

.as-block--error {
  background: #fff1f1;
  color: #9f1d1d;
}

.as-spinner {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 2px solid #b7c5da;
  border-top-color: #2563eb;
  animation: as-spin 0.9s linear infinite;
  flex-shrink: 0;
}

.as-spinner--inline {
  width: 11px;
  height: 11px;
  margin-left: auto;
}

.as-block--thinking,
.as-tool-group {
  border: 1px solid #e3eaf3;
  background: #f8fafd;
  overflow: hidden;
}

.as-block--thinking summary,
.as-tool-group summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  cursor: pointer;
}

.as-block--thinking pre {
  margin: 0;
  padding: 8px 10px 10px;
  border-top: 1px solid #e3eaf3;
  white-space: pre-wrap;
  color: #4b5870;
  font-size: 12px;
}

.as-block__icon {
  width: 16px;
  text-align: center;
  color: #2563eb;
  flex-shrink: 0;
}

.as-tool__summary {
  flex: 1;
  min-width: 0;
  color: #66758c;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.as-tool-group__list {
  display: grid;
  gap: 4px;
  padding: 0 8px 8px 22px;
  border-left: 2px solid #dbe4f0;
  margin-left: 14px;
}

.as-task-plan {
  border: 1px solid #e3eaf3;
  background: #f8fafd;
  padding: 8px 10px;
}

.as-task-plan__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.as-task-plan ol {
  display: grid;
  gap: 5px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.as-task-plan__item {
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 8px;
  align-items: baseline;
}

.as-task-plan__item span {
  color: #66758c;
  font-size: 12px;
}

.as-footer {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  color: #66758c;
  font-size: 11.5px;
}

.as-footer__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.as-footer__dot--active {
  background: #16a34a;
  animation: as-pulse 1.2s ease-in-out infinite;
}

.as-footer__dot--done {
  background: #a8b3c2;
}

.as-pane__error {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  background: #fff1f1;
  color: #9f1d1d;
  border-top: 1px solid #ffd7d7;
}

.as-pane__error button {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.as-pane__composer {
  border-top: 1px solid #e5ebf3;
  padding: 9px 12px 11px;
  flex-shrink: 0;
}

.as-pane__composer-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.as-pane__meta-btn {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid #d7e0ec;
  background: #f5f8fc;
  cursor: pointer;
}

.as-composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.as-composer__input {
  flex: 1;
  min-width: 0;
  resize: none;
  border: 1px solid #d7e0ec;
  border-radius: 10px;
  padding: 10px 12px;
  line-height: 1.45;
  font: inherit;
  outline: none;
  max-height: 180px;
}

.as-composer__input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.14);
}

.as-composer__send {
  min-width: 64px;
  height: 38px;
  border-radius: 9px;
  border: 0;
  background: #2563eb;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.as-composer__send:disabled {
  background: #aab6c8;
  cursor: not-allowed;
}

.as-pane__launcher {
  display: grid;
  gap: 7px;
  margin-top: 8px;
}

.as-pane__scroll {
  position: sticky;
  bottom: 8px;
  margin-left: auto;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid #d7e0ec;
  background: #fff;
  color: #2563eb;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(23, 32, 51, 0.14);
}

/* Density spectrum (CHG-013 D8): full (default sizing above) ⊃ chat ⊃ compact.
   chat = single-column conversation: slightly tighter than full, full-size text.
   compact = companion sidebar: tightest padding + smaller avatar/text. */
.as-pane--chat .as-pane__timeline {
  padding: 10px 12px;
}

.as-pane--chat .as-message {
  padding: 9px 0;
}

.as-pane--compact .as-pane__header {
  padding: 8px 10px;
}

.as-pane--compact .as-pane__timeline {
  padding: 10px;
}

.as-pane--compact .as-message {
  gap: 8px;
  padding: 8px 0;
}

.as-pane--compact .as-message__avatar {
  width: 24px;
  height: 24px;
}

.as-pane--compact .as-block,
.as-pane--compact .as-block--text {
  font-size: 12.5px;
}

.as-pane--compact .as-pane__composer {
  padding: 8px 10px;
}

:deep(.as-code) {
  margin: 6px 0;
  padding: 8px 10px;
  border-radius: 7px;
  background: #111827;
  color: #f8fafc;
  overflow-x: auto;
}

:deep(.as-inline-code) {
  border-radius: 4px;
  padding: 1px 4px;
  background: #eef3f8;
}

@keyframes as-spin {
  to { transform: rotate(360deg); }
}

@keyframes as-pulse {
  0%, 100% { opacity: 0.55; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.12); }
}
</style>
