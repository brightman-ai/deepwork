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
        :data-round="message.role === 'user' ? userRoundOf(index) : undefined"
      >
        <div v-if="message.role !== 'user'" class="as-message__avatar" aria-hidden="true">
          {{ message.role === 'system' ? '!' : 'AI' }}
        </div>
        <div class="as-message__body">
          <UserBubble
            v-if="message.role === 'user'"
            :content="String(message.content ?? '')"
            :round="userRoundOf(index)"
            :current="userBubbleNav ? (message.versionIndex ?? 1) : undefined"
            :total="userBubbleNav ? (message.versionCount ?? userBubbleTotal) : undefined"
            :steered="message.steered"
            @nav="(dir) => emit('block-action', { action: 'user-nav', block: message, message, index, payload: { dir } })"
          />
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
                :actionable="blockActionable"
                v-on="blockActionHandlers(block, message, index)"
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
              :actionable="blockActionable"
              v-on="blockActionHandlers({ type: 'usage' } as unknown as AssistantBlock, message, index)"
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
      <span class="as-pane__error-msg">{{ error }}</span>
      <button
        v-if="!streaming"
        type="button"
        class="as-pane__error-retry"
        data-testid="assistant-error-retry"
        @click="emit('retry')"
      >重试</button>
      <button type="button" class="as-pane__error-close" aria-label="关闭" @click="emit('clear-error')">×</button>
    </div>

    <!-- ws-ux-r2 C2: quote-inject 选区浮 pill — 流内选中即现, 点击把选中文本以
         markdown 引用块注入 draft 光标尾。Teleport body: 逃逸 overflow/transform 裁剪。 -->
    <Teleport to="body">
      <button
        v-if="quotePill"
        type="button"
        class="as-quote-pill"
        :style="{ left: quotePill.x + 'px', top: quotePill.y + 'px' }"
        data-testid="assistant-quote-inject"
        aria-label="把选中文本引用到输入框"
        @mousedown.prevent
        @click="insertQuote"
      >⌯ 引用到输入</button>
    </Teleport>

    <footer v-if="!readonly" class="as-pane__composer">
      <slot name="composerPrefix" />
      <!-- ws-ux-r3 R2-3 / codex-review-r1 #16: composerMeta 移动端不占行 was made a
           BLANKET rule for every Surface consumer, but only the workspace consumer's
           placeholder actually restates the same info — Claw/Topic pass their OWN
           meaningful metadata that has no mobile substitute. `composerMetaHideMobile`
           (default false) makes the suppression opt-in; only the ws consumer sets it. -->
      <div v-if="launcherItems.length || showComposerMeta" class="as-pane__composer-meta">
        <button
          v-if="launcherItems.length"
          type="button"
          class="as-pane__meta-btn"
          @click="launcherOpen = !launcherOpen"
        >
          +
        </button>
        <span v-if="showComposerMeta">{{ composerMeta }}</span>
      </div>
      <!-- ws-ux-r3 R1: 附件 chip 行 (仅 allowAttach 且有附件时出现 — 零附件零占位)。 -->
      <div v-if="allowAttach && attachments.length" class="as-attach" data-testid="assistant-attachments">
        <span
          v-for="a in attachments"
          :key="a.id"
          class="as-attach__chip"
          :class="{ 'is-error': a.status === 'error', 'is-uploading': a.status === 'uploading' }"
          :title="a.error || a.name"
        >
          <img v-if="a.previewUrl" class="as-attach__thumb" :src="a.previewUrl" alt="" />
          <span v-else aria-hidden="true">🖼</span>
          <span class="as-attach__name">{{ a.name }}</span>
          <span v-if="a.status === 'uploading'" class="as-attach__spin" aria-label="上传中" />
          <button
            type="button"
            class="as-attach__x"
            :aria-label="`移除 ${a.name}`"
            @click="emit('attach-remove', a.id)"
          >×</button>
        </span>
      </div>
      <div class="as-composer">
        <button
          v-if="allowAttach"
          type="button"
          class="as-composer__attach"
          title="添加图片（或直接粘贴截图）"
          aria-label="添加图片"
          data-testid="assistant-composer-attach"
          @click="attachInputRef?.click()"
        >📎</button>
        <input
          v-if="allowAttach"
          ref="attachInputRef"
          type="file"
          accept="image/*"
          multiple
          hidden
          @change="onAttachPick"
        />
        <textarea
          ref="textareaRef"
          v-model="draft"
          class="as-composer__input"
          :placeholder="effectivePlaceholder"
          :disabled="disabled || (streaming && !steerable)"
          rows="1"
          aria-label="消息输入"
          data-testid="assistant-composer-input"
          @input="resizeComposer"
          @focus="onComposerFocus"
          @blur="onComposerBlur"
          @paste="onComposerPaste"
          @keydown.enter.exact.prevent="submit"
        />
        <!-- streaming 态：消费点 opt-in `stoppable` 时显 codex 式可点"■ 停止"→ emit('stop')
             （接 @stop 调 /interrupt 中断当前生成：PTY 保进程 warm / SDK SIGINT）。未声明
             stoppable 的消费点保留旧禁用"..."（不显示点了无效的钮 — 数据诚实，同 F2）。 -->
        <button
          v-if="streaming && stoppable"
          type="button"
          class="as-composer__send as-composer__send--stop"
          data-testid="assistant-composer-stop"
          @click="emit('stop')"
        >
          ■ 停止
        </button>
        <button
          v-else
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  AssistantBlock,
  AssistantContextItem,
  AssistantDensity,
  AssistantLauncherItem,
  AssistantMessage,
} from './types'
import { blockRegistry } from './blockRegistry'
import type { ComposerAttachment } from './primitives/ComposerShell.vue'
import {
  ThinkingBlock,
  ToolGroupBlock,
  TaskPlanBlock,
  WaitingBlock,
  PermissionBlock,
  ErrorBlock,
  UsageFooter,
  UserBubble,
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
  // codex-review-r1 #16: opt-in mobile suppression for composerMeta. Default false =
  // every consumer keeps its historical "always show composerMeta" behavior (Claw/
  // Topic/od/chat). The workspace consumer's placeholder already restates the same
  // info on narrow viewports, so IT alone passes true to avoid the redundant row.
  composerMetaHideMobile?: boolean
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
  // F2: 消费点接线了 @block-action 处理 → 置 true 才渲染块内动作钮（审批/产物导出等）。
  // 默认 false：未接线时不显示可点但无效的按钮（数据诚实）。
  blockActionable?: boolean
  // F10: chat 等消费点接入用户消息版本切换 → 置 true 才显示 UserBubble nav 钮。
  userBubbleNav?: boolean
  userBubbleTotal?: number
  // A4: 消费点接线了 @stop（调 /interrupt 中断当前生成）→ 置 true，streaming 态把发送键
  // 换成 codex 式可点"■ 停止"。默认 false：未接线的消费点保留旧禁用"..."（不显示无效钮）。
  stoppable?: boolean
  // owner 对称 steer: 消费点接线了 @steer（POST input-events 把补充说明插入运行轮）→
  // 置 true，streaming 态 textarea 不再锁死、Enter 走 steer 而非新轮 send。默认 false：
  // 未接线的消费点保留旧行为（streaming 时禁用输入，同 canSend 语义）。
  steerable?: boolean
  // ws-ux-r3 R1: 附件位（与 ComposerShell 同款最小契约, 壳零智能）。消费点接线了
  // @attach-files（上传/校验/状态归装配方 composable）→ 置 true 才渲染 📎 + chip 行
  // + 粘贴图拦截。默认 false：零渲染零成本。
  allowAttach?: boolean
  attachments?: ComposerAttachment[]
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
  composerMetaHideMobile: false,
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
  blockActionable: false,
  userBubbleNav: false,
  userBubbleTotal: 0,
  stoppable: false,
  steerable: false,
  allowAttach: false,
  attachments: () => [],
})

// CHG-014 S8 F2/F3: 单一 @block-action 透传协议。块声明业务 emit（artifact
// open/export、qbanner goto、strip expand、permission allow/deny、user-bubble nav…），
// 但块本身零业务 → surface 统一归集为一个 block-action 事件转发给消费者。
// 消费点接线后用 block-actionable 打开按钮渲染；未接线时按钮不渲染（数据诚实，
// 不显示可点但无效的钮 — F2）。
export interface AssistantBlockAction {
  action: string                          // 'open'|'export'|'goto'|'expand'|'allow-once'|'allow-always'|'deny'|'user-nav'|'copy'|'retry'|'project'|'branch'
  block: unknown                          // 触发块（含 type）
  message: AssistantMessage
  index: number                           // 消息在时间线中的下标
  payload?: Record<string, unknown>       // 附加数据（如 nav dir）
}

const emit = defineEmits<{
  (e: 'send', text: string): void
  (e: 'stop'): void
  (e: 'steer', text: string): void
  (e: 'clear-error'): void
  (e: 'retry'): void
  (e: 'block-action', action: AssistantBlockAction): void
  // ws-ux-r2 C3: draft 外泄事件 — 消费点可按 session 持久草稿（切会话/切 portal 不丢）。
  // 未接线的消费点零影响（纯多播）。恢复用既有 expose setDraft。
  (e: 'update:draft', text: string): void
  // ws-ux-r3 R1: 附件事件（壳只转发 File[], 上传/校验归装配方）。
  (e: 'attach-files', files: File[]): void
  (e: 'attach-remove', id: string): void
}>()

const draft = ref('')

// ws-ux-r3 R1: 附件拾取/粘贴 — 壳只转发 File[]，上传归装配方。
const attachInputRef = ref<HTMLInputElement | null>(null)
function onAttachPick(e: Event): void {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? []).filter((f) => f.type.startsWith('image/'))
  if (files.length) emit('attach-files', files)
  input.value = '' // 允许再次选择同一文件
}
function onComposerPaste(e: ClipboardEvent): void {
  if (!props.allowAttach) return
  const items = Array.from(e.clipboardData?.items ?? [])
  const files = items
    .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
    .map((it) => it.getAsFile())
    .filter((f): f is File => !!f)
  if (!files.length) return // 文本粘贴不拦
  e.preventDefault()
  emit('attach-files', files)
  // codex-review-r1 #17: a mixed clipboard payload (image + text — e.g. a screenshot
  // copied alongside a caption) previously lost the text entirely, because
  // preventDefault() also suppresses the browser's native paste-insert. Manually splice
  // the text/plain payload in at the caret so neither the image nor the text is dropped.
  const text = e.clipboardData?.getData('text/plain') ?? ''
  if (text) insertTextAtCaret(text)
}

// codex-review-r1 #17: insert text at the current caret (or append if the textarea/
// selection isn't available), mirroring what the browser's default paste would have
// done had preventDefault() not been required for the image branch above.
function insertTextAtCaret(text: string): void {
  const el = textareaRef.value
  if (!el) { draft.value += text; return }
  const start = el.selectionStart ?? draft.value.length
  const end = el.selectionEnd ?? draft.value.length
  draft.value = draft.value.slice(0, start) + text + draft.value.slice(end)
  const caret = start + text.length
  nextTick(() => {
    resizeComposer()
    el.selectionStart = el.selectionEnd = caret
  })
}

// ws-ux-r3 R2-3: 移动视口信号（composerMeta 不占行）。matchMedia 监听, SSR 安全。
const isNarrowViewport = ref(false)
let narrowMq: MediaQueryList | null = null
function onNarrowMq(e: MediaQueryListEvent | MediaQueryList): void { isNarrowViewport.value = e.matches }
onMounted(() => {
  if (typeof window === 'undefined' || !window.matchMedia) return
  narrowMq = window.matchMedia('(max-width: 768px)')
  onNarrowMq(narrowMq)
  narrowMq.addEventListener('change', onNarrowMq)
})
onBeforeUnmount(() => { narrowMq?.removeEventListener('change', onNarrowMq) })
watch(draft, (v) => emit('update:draft', v))
const launcherOpen = ref(false)
const timelineRef = ref<HTMLDivElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const autoScroll = ref(true)
const showScrollButton = ref(false)

const contextItems = computed(() => props.contextItems ?? [])
const launcherItems = computed(() => props.launcherItems ?? [])
const canSend = computed(() => !props.disabled && !props.streaming && draft.value.trim().length > 0)
// codex-review-r1 #16: composerMeta shows unless THIS consumer opted into mobile
// suppression (composerMetaHideMobile) AND the viewport is actually narrow.
const showComposerMeta = computed(() =>
  !!props.composerMeta && (!props.composerMetaHideMobile || !isNarrowViewport.value),
)
// steerable + streaming 态：placeholder 提示 Enter 走 steer（插入运行轮），而非常规发送。
const effectivePlaceholder = computed(() =>
  props.streaming && props.steerable
    ? '补充说明会插入当前轮…（Enter 排队 · Shift+Enter 换行）'
    : props.placeholder,
)
const hasLiveAssistantMessage = computed(() => {
  const last = props.messages[props.messages.length - 1]
  return Boolean(
    props.streaming &&
    last?.role === 'assistant' &&
    (last.streaming || last.blocks?.length || last.content),
  )
})

// ws-ux-r3 W5 (切回落最新): 首批消息落地 = 强制置底一次。旧逻辑只有"近底才跟"——大
// transcript 分块渲染时首帧就超出视口 → nearBottom 永假 → 进会话停在中途旧楼层
// (移动实测 #4/12, PC 偶合命中)。仅首次强制; 此后仍是"近底才跟"(上滚阅读不被打断)。
// 组件按 session :key 重挂 → "落最新"天然 per-session。
let initialScrolled = false
watch(
  () => [props.messages.length, props.streamingContent, props.streaming] as const,
  () => {
    const force = !initialScrolled && props.messages.length > 0
    if (force) initialScrolled = true
    nextTick(() => void scrollToBottom(force))
  },
)

watch(
  () => props.messages,
  () => nextTick(() => scrollToBottom(false)),
  { deep: true },
)

onMounted(() => {
  resizeComposer()
  // C2 quote-inject: selectionchange 是 PC 划选 + 移动长按选中的统一信号源。
  document.addEventListener('selectionchange', onSelectionChange)
  window.addEventListener('keydown', onQuoteKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('selectionchange', onSelectionChange)
  window.removeEventListener('keydown', onQuoteKeydown)
})

// CHG-014-J D2: msg-u rnd chip — the #N round label is the ordinal of this user
// message within the timeline (1-based count of user roles up to `index`). Pure
// presentational derivation from the message list; no new data dependency.
function userRoundOf(index: number): number {
  let n = 0
  for (let i = 0; i <= index && i < props.messages.length; i++) {
    if (props.messages[i].role === 'user') n++
  }
  return n
}

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
  if (!text) return
  // owner 对称 steer: streaming + steerable 态下 Enter 不新开轮，而是把补充说明插入
  // 正在跑的运行轮（消费点 @steer 调 POST input-events）。canSend 语义不变（仍要求
  // !streaming）——发送按钮在 streaming 时保持禁用，steer 只走 Enter 这一条路径。
  if (props.streaming && props.steerable) {
    draft.value = ''
    launcherOpen.value = false
    resizeComposer()
    emit('steer', text)
    return
  }
  if (!canSend.value) return
  // ws-ux-r3 W5: 发送 = 用户显式要看自己的新 turn — 强制跟底, 不受"仅近底才跟"
  // 保护(那是给流式期上滚阅读用的)。修"发了但视口停在旧楼层, 像没反应"(WA-2)。
  nextTick(() => void scrollToBottom(true))
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

// ws-ux-r2 C1: composer 三态（dock→compose）— 移动端聚焦时上限放宽到 38vh（多行草稿
// 可写），失焦回 dock 上限。关键不变量：展开只改 textarea 自身高度，**不锁流滚动、
// 不强制贴底**（autoScroll/showScrollButton 既有机制原样）——边滚边写成立。
const composerFocused = ref(false)
function composerMaxPx(): number {
  if (composerFocused.value && typeof window !== 'undefined' && window.innerWidth <= 768) {
    return Math.round(window.innerHeight * 0.38)
  }
  return 180
}
function onComposerFocus(): void { composerFocused.value = true; resizeComposer() }
function onComposerBlur(): void { composerFocused.value = false; resizeComposer() }

function resizeComposer(): void {
  if (!textareaRef.value) return
  textareaRef.value.style.height = 'auto'
  textareaRef.value.style.height = `${Math.min(textareaRef.value.scrollHeight, composerMaxPx())}px`
}

// ws-ux-r2 C2: quote-inject 引用回输 — 流内选中文本 → 选区旁浮 pill「⌯ 引用到输入」→
// 以 markdown 引用块追加进 draft。多次选中多次注入 = 多段复制不离屏（tmux 做不到的点）。
// 只读/禁用面不启用；选区塌缩/Escape/点击注入后消失。系统剪贴板行为不受影响（不清选区）。
const QUOTE_MAX = 4000
const quotePill = ref<{ x: number; y: number; text: string } | null>(null)
function onSelectionChange(): void {
  if (props.readonly || props.disabled) { quotePill.value = null; return }
  const sel = typeof window !== 'undefined' ? window.getSelection() : null
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) { quotePill.value = null; return }
  const tl = timelineRef.value
  if (!tl) { quotePill.value = null; return }
  const range = sel.getRangeAt(0)
  // 选区必须落在本 surface 的时间线内（别的 surface/页面区域的选中不弹）。
  const node = range.commonAncestorContainer
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  if (!el || !tl.contains(el)) { quotePill.value = null; return }
  const text = sel.toString().trim()
  if (!text) { quotePill.value = null; return }
  const rect = range.getBoundingClientRect()
  quotePill.value = {
    x: Math.max(8, Math.min(rect.left + rect.width / 2, window.innerWidth - 8)),
    y: Math.max(8, rect.top - 10),
    text,
  }
}
function insertQuote(): void {
  const q = quotePill.value
  if (!q) return
  let t = q.text
  if (t.length > QUOTE_MAX) t = `${t.slice(0, QUOTE_MAX)}…`
  const quoted = t.split('\n').map((l) => `> ${l}`).join('\n')
  draft.value = draft.value.trim().length ? `${draft.value.replace(/\n?$/, '\n')}${quoted}\n` : `${quoted}\n`
  quotePill.value = null
  nextTick(() => { resizeComposer(); textareaRef.value?.focus() })
}
function onQuoteKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && quotePill.value) quotePill.value = null
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
  // C3: focus 可选（默认 true 保持 qopt 预填行为）— 草稿静默恢复传 false, 免得每次
  // 切会话移动端都弹键盘。
  setDraft(text: string, focus = true) {
    draft.value = text
    resizeComposer()
    if (focus) nextTick(() => textareaRef.value?.focus())
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

// F2/F3: 把每个块声明的业务 emit 统一归集为单个 block-action 透传给消费者。
// 块组件只 emit 语义动作名（如 ArtifactCard 'open'/'export'、QBanner 'goto'、
// StripBlock 'expand'、PermissionBlock 'allow-once'/'allow-always'/'deny'、
// UsageFooter 'copy'/'retry'/'project'/'branch'）。surface 不解释语义，只转发。
// v-on 绑定整张表是无害的：组件未声明的事件名不会触发。
function blockActionHandlers(block: AssistantBlock, message: AssistantMessage, index: number) {
  const fire = (action: string, payload?: Record<string, unknown>) =>
    emit('block-action', { action, block, message, index, payload })
  return {
    open: () => fire('open'),
    export: () => fire('export'),
    goto: () => fire('goto'),
    expand: () => fire('expand'),
    'allow-once': () => fire('allow-once'),
    'allow-always': () => fire('allow-always'),
    deny: () => fire('deny'),
    copy: () => fire('copy'),
    retry: () => fire('retry'),
    project: () => fire('project'),
    branch: () => fire('branch'),
  }
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
/* CHG-014 V3-D: v6 tokenization. This surface was hardcoded LIGHT; every color
   below now maps to the --dw-* primitive vocabulary (tokens.css) so the dark
   shell renders consistently. Behavior-frozen — CSS values only, no markup/logic
   change. Token map: bg/transparent surface · --dw-sf strips · --dw-sf2 insets ·
   --dw-sf3 active/bubble · --dw-bd borders · --dw-mu muted · --dw-fg text ·
   --dw-ac amber accent (single accent lock) · --dw-mono mono hints. */
.as-pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--dw-bg);
  color: var(--dw-fg);
}

.as-pane__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--dw-bd);
  background: var(--dw-sf);
  flex-shrink: 0;
}

.as-pane__eyebrow {
  display: block;
  color: var(--dw-mu);
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
  background: var(--dw-sf2);
  color: var(--dw-mu);
}

.as-pane__header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.as-pane__state--active,
.as-pane__state--ready,
.as-badge--done {
  background: var(--dw-ok-dim);
  color: var(--dw-ok);
}

.as-pane__state--pending,
.as-badge--running {
  background: var(--dw-blu-dim);
  color: var(--dw-blu);
}

.as-pane__state--error,
.as-badge--error {
  background: var(--dw-red-dim);
  color: var(--dw-red);
}

.as-pane__context {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding: 8px 12px;
  background: var(--dw-sf);
  border-bottom: 1px solid var(--dw-bd);
  flex-shrink: 0;
}

.as-pane__context-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.as-pane__context-chip--warning {
  background: var(--dw-warn-dim);
  color: var(--dw-warn);
}

.as-pane__context-chip--good {
  background: var(--dw-ok-dim);
  color: var(--dw-ok);
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
  color: var(--dw-mu);
}

.as-pane__empty-title {
  color: var(--dw-fg);
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
  border: 1px solid var(--dw-bd);
  background: var(--dw-sf2);
  border-radius: 8px;
  padding: 9px 10px;
  cursor: pointer;
}

.as-pane__example:hover,
.as-pane__launcher-item:hover {
  background: var(--dw-sf3);
}

.as-pane__example-label,
.as-pane__launcher-item strong {
  display: block;
  color: var(--dw-fg);
  font-weight: 700;
}

.as-pane__example-desc,
.as-pane__launcher-item span {
  display: block;
  color: var(--dw-mu);
  font-size: 12px;
  margin-top: 2px;
}

.as-message {
  display: flex;
  gap: 10px;
  padding: 10px 0;
}

.as-message + .as-message {
  border-top: 1px solid var(--dw-bd);
}

.as-message--user {
  justify-content: flex-end;
}

.as-message__avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--dw-ac);
  color: var(--dw-on-accent);
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

/* v6 user bubble: the inline div was replaced by the <UserBubble> block (msg-u
   右对齐 amber-surface 泡 + rnd #N chip). The block owns its own scoped styles. */

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
  border: 1px solid var(--dw-bd);
  background: var(--dw-sf);
}

.as-block--error {
  background: var(--dw-red-dim);
  color: var(--dw-red);
}

.as-spinner {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 2px solid var(--dw-bd);
  border-top-color: var(--dw-ac);
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
  border: 1px solid var(--dw-bd);
  background: var(--dw-sf);
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
  border-top: 1px solid var(--dw-bd);
  white-space: pre-wrap;
  color: var(--dw-mu);
  font-size: 12px;
}

.as-block__icon {
  width: 16px;
  text-align: center;
  color: var(--dw-ac);
  flex-shrink: 0;
}

.as-tool__summary {
  flex: 1;
  min-width: 0;
  color: var(--dw-mu);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.as-tool-group__list {
  display: grid;
  gap: 4px;
  padding: 0 8px 8px 22px;
  border-left: 2px solid var(--dw-bd);
  margin-left: 14px;
}

.as-task-plan {
  border: 1px solid var(--dw-bd);
  background: var(--dw-sf);
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
  color: var(--dw-mu);
  font-size: 12px;
}

.as-footer {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  color: var(--dw-mu);
  font-size: 11.5px;
}

.as-footer__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.as-footer__dot--active {
  background: var(--dw-ok);
  animation: as-pulse 1.2s ease-in-out infinite;
}

.as-footer__dot--done {
  background: var(--dw-mu);
}

.as-pane__error {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--dw-red-dim);
  color: var(--dw-red);
  border-top: 1px solid var(--dw-bd);
}

.as-pane__error-msg {
  flex: 1 1 auto;
  min-width: 0;
}

.as-pane__error button {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

/* 重试 — a real affordance (not just dismiss). Bordered pill so it reads as the
   primary recovery action; the × stays a quiet dismiss. */
.as-pane__error-retry {
  flex: none;
  padding: 2px 10px;
  border: 1px solid currentColor !important;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
}
.as-pane__error-retry:hover {
  background: color-mix(in srgb, currentColor 14%, transparent);
}
.as-pane__error-close {
  flex: none;
  font-size: 15px;
  line-height: 1;
  opacity: 0.7;
}
.as-pane__error-close:hover { opacity: 1; }

/* v6 composer (.cmp / .cmp-box): --sf strip, --sf2 inset box, amber focus ring,
   amber send button with on-accent glyph (single accent lock). */
.as-pane__composer {
  border-top: 1px solid var(--dw-bd);
  background: var(--dw-sf);
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
  border: 1px solid var(--dw-bd);
  background: var(--dw-sf2);
  color: var(--dw-mu);
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
  border: 1px solid var(--dw-bd);
  background: var(--dw-sf2);
  color: var(--dw-fg);
  border-radius: 10px;
  padding: 10px 12px;
  line-height: 1.45;
  font: inherit;
  outline: none;
  max-height: 180px;
}

.as-composer__input::placeholder {
  color: var(--dw-mu);
}

.as-composer__input:focus {
  border-color: var(--dw-ac-border-focus);
  box-shadow: 0 0 0 3px var(--dw-ac-dim);
}

.as-composer__send {
  min-width: 64px;
  height: 38px;
  border-radius: 9px;
  border: 0;
  background: var(--dw-ac);
  color: var(--dw-on-accent);
  font-weight: 700;
  cursor: pointer;
}

.as-composer__send:disabled {
  background: var(--dw-sf3);
  color: var(--dw-mu);
  cursor: not-allowed;
}

/* streaming 态停止键 — codex 式可点"■ 停止"：红调以区别 amber 发送键，明确"中断当前
   生成"的破坏性动作语义；进程仍 warm（非 kill），故非危险红而是温和警示红。 */
.as-composer__send--stop {
  background: var(--dw-red-dim);
  color: var(--dw-red);
  border: 1px solid var(--dw-red);
  cursor: pointer;
}

.as-composer__send--stop:hover {
  background: color-mix(in srgb, var(--dw-red) 20%, transparent);
}

.as-pane__launcher {
  display: grid;
  gap: 7px;
  margin-top: 8px;
}

/* ws-ux-r3 R1: 附件 chip 行 + 📎。紧凑 ≤32px, 移动横向滚不换行。 */
.as-attach {
  display: flex; align-items: center; gap: 6px;
  margin-bottom: 6px; overflow-x: auto; scrollbar-width: none;
}
.as-attach::-webkit-scrollbar { display: none; }
.as-attach__chip {
  display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0;
  height: 28px; padding: 0 6px; border-radius: 7px;
  border: 1px solid var(--dw-bd); background: var(--dw-sf2);
  font-size: 11px; color: var(--dw-fg); max-width: 190px;
}
.as-attach__chip.is-error { border-color: var(--dw-red, #e5484d); color: var(--dw-red, #e5484d); }
.as-attach__chip.is-uploading { opacity: 0.75; }
.as-attach__thumb { width: 20px; height: 20px; border-radius: 4px; object-fit: cover; }
.as-attach__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.as-attach__spin {
  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
  border: 1.5px solid var(--dw-mu); border-top-color: transparent;
  animation: as-attach-spin 0.8s linear infinite;
}
@keyframes as-attach-spin { to { transform: rotate(360deg); } }
.as-attach__x {
  display: inline-grid; place-items: center; width: 18px; height: 18px;
  margin: -2px -2px -2px 0; padding: 0; border: none; border-radius: 5px;
  background: none; color: var(--dw-mu); font-size: 13px; cursor: pointer;
}
.as-attach__x:hover { color: var(--dw-fg); background: var(--dw-sf3); }
.as-composer__attach {
  flex-shrink: 0; width: 34px; height: 34px; align-self: flex-end;
  border: 1px solid var(--dw-bd); border-radius: 9px; background: none;
  color: var(--dw-mu); font-size: 15px; cursor: pointer;
}
.as-composer__attach:hover { color: var(--dw-fg); border-color: var(--dw-fg); }
@media (max-width: 768px) {
  /* 触摸目标 ≥40px（移动 📎/×）。 */
  .as-composer__attach { width: 40px; height: 40px; }
  .as-attach__x { width: 24px; height: 24px; }
}

.as-pane__scroll {
  position: sticky;
  bottom: 8px;
  margin-left: auto;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--dw-bd);
  background: var(--dw-sf3);
  color: var(--dw-ac);
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
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

/* code fences: v6 .bout uses --sf on dark canvas; inline code on --sf2 (mono) */
:deep(.as-code) {
  margin: 6px 0;
  padding: 8px 10px;
  border-radius: 7px;
  background: var(--dw-sf);
  border: 1px solid var(--dw-bd);
  color: var(--dw-fg);
  font-family: var(--dw-mono);
  overflow-x: auto;
}

:deep(.as-inline-code) {
  border-radius: 4px;
  padding: 1px 4px;
  background: var(--dw-sf2);
  color: var(--dw-fg);
  font-family: var(--dw-mono);
}

@keyframes as-spin {
  to { transform: rotate(360deg); }
}

@keyframes as-pulse {
  0%, 100% { opacity: 0.55; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.12); }
}

/* ws-ux-r2 C2: quote-inject 选区浮 pill — 选区上方居中, accent 底, 触摸友好高度。
   fixed + translate(-50%,-100%) 锚选区顶中点; z 高于抽屉/sheet (61) 之上。 */
.as-quote-pill {
  position: fixed; z-index: 70; transform: translate(-50%, -100%);
  display: inline-flex; align-items: center; gap: 4px;
  min-height: 32px; padding: 5px 12px; border-radius: 999px;
  border: 1px solid var(--dw-ac); background: var(--dw-sf);
  color: var(--dw-ac); font-size: 12px; font-weight: 600; white-space: nowrap;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  cursor: pointer;
}
.as-quote-pill:active { background: var(--dw-ac-dim); }
</style>
