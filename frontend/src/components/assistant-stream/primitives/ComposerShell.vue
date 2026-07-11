<script setup lang="ts">
// CHG-014 D3: cmp 输入器壳 (原型 1021-1037/1151-1156)。
// mention 行槽 (slot) + textarea (v-model) + cmp-bar (/技能 @文件 ⌘↵ + amber 圆发送)
// + envrow 槽 (slot=envrow，放 EnvChip)。纯壳，发送/技能/文件逻辑由装配方接。
//
// R1 图片附件位（壳零智能铁律：不 fetch、不读全局，纯 props/emits）。
// allowAttach=false 时零渲染零成本；真正的上传/校验/状态流转由装配方的 composable
// （如 pro 的 useWsAttachments）负责，本组件只做"选图/粘贴图 → emit 文件"
// 与"渲染调用方传入的 attachments 状态"两件事。
//
// 最小用例（装配方伪代码）：
//   <ComposerShell
//     v-model="draft"
//     :allow-attach="true"
//     :attachments="attachments"
//     @attach-files="files => pickFiles(files)"
//     @attach-remove="id => removeAttachment(id)"
//     @send="onSend"
//   />
import { nextTick, ref } from 'vue'

export interface ComposerAttachment {
  id: string
  name: string
  previewUrl?: string
  status: 'uploading' | 'ready' | 'error'
  error?: string
}

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  disabled?: boolean
  canSend?: boolean
  /** 默认 false：不渲染附件按钮/粘贴拦截/chip 行，零成本。 */
  allowAttach?: boolean
  attachments?: ComposerAttachment[]
}>(), {
  placeholder: '追加指令… / 技能 · @ 文件',
  disabled: false,
  canSend: true,
  allowAttach: false,
  attachments: () => [],
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'send'): void
  (e: 'attach-files', files: File[]): void
  (e: 'attach-remove', id: string): void
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

function onInput(ev: Event): void {
  const el = ev.target as HTMLTextAreaElement
  emit('update:modelValue', el.value)
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 180)}px`
}

function submit(): void {
  if (props.disabled || props.canSend === false || !props.modelValue.trim()) return
  emit('send')
}

function openFilePicker(): void {
  if (props.disabled) return
  fileInputRef.value?.click()
}

function onFileInputChange(ev: Event): void {
  const input = ev.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (files.length > 0) emit('attach-files', files)
  // 复位，允许连续两次选中同一张图仍触发 change
  input.value = ''
}

// 粘贴事件里含图片文件 → 拦截并 emit；纯文本粘贴不拦，走 textarea 默认行为。
function onPaste(ev: ClipboardEvent): void {
  if (!props.allowAttach) return
  const files = Array.from(ev.clipboardData?.files || []).filter(f => f.type.startsWith('image/'))
  if (files.length === 0) return
  ev.preventDefault()
  emit('attach-files', files)
  // codex-review-r1 #17: a mixed clipboard payload (image + text — e.g. a screenshot
  // copied alongside a caption) previously lost the text entirely, because
  // preventDefault() also suppresses the browser's native paste-insert. Manually splice
  // the text/plain payload in at the caret so neither the image nor the text is dropped.
  const text = ev.clipboardData?.getData('text/plain') ?? ''
  if (text) insertTextAtCaret(text)
}

// codex-review-r1 #17: this component is a CONTROLLED textarea (:value="modelValue",
// no internal draft ref) — splice at the caret via the DOM element, then emit the
// merged value so the parent's v-model stays the single source of truth.
function insertTextAtCaret(text: string): void {
  const el = textareaRef.value
  const current = props.modelValue
  if (!el) { emit('update:modelValue', current + text); return }
  const start = el.selectionStart ?? current.length
  const end = el.selectionEnd ?? current.length
  const next = current.slice(0, start) + text + current.slice(end)
  emit('update:modelValue', next)
  const caret = start + text.length
  nextTick(() => {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
    el.selectionStart = el.selectionEnd = caret
  })
}

// codex-review-r1 #19: uploading/error attachment state was communicated through
// animation/color/title alone (the spinner is explicitly aria-hidden) — this feeds a
// visually-hidden, aria-live status span so assistive tech gets the same signal.
function chipStatusText(att: ComposerAttachment): string {
  if (att.status === 'uploading') return `${att.name} 上传中`
  if (att.status === 'error') return `${att.name} 上传失败${att.error ? '：' + att.error : ''}`
  return ''
}

defineExpose({
  focus() { nextTick(() => textareaRef.value?.focus()) },
})
</script>

<template>
  <div class="v6-cmp" data-testid="v6-composer">
    <div class="v6-cmp-box">
      <!-- codex-review-r1 #18: gate on allowAttach too — the "zero-render when
           allowAttach=false" contract must hold even if a caller still passes stale
           attachments (attachments.length alone used to be enough to render this row). -->
      <div v-if="allowAttach && attachments.length > 0" class="v6-cmp__attachments" data-testid="v6-composer-attachments">
        <div
          v-for="att in attachments"
          :key="att.id"
          class="v6-cmp__chip"
          :class="{ 'v6-cmp__chip--error': att.status === 'error' }"
          :title="att.status === 'error' ? att.error : att.name"
        >
          <img v-if="att.previewUrl" :src="att.previewUrl" class="v6-cmp__chip-thumb" alt="" />
          <span v-else class="v6-cmp__chip-thumb v6-cmp__chip-thumb--ph" aria-hidden="true">🖼</span>
          <span class="v6-cmp__chip-name">{{ att.name }}</span>
          <span v-if="att.status === 'uploading'" class="v6-cmp__chip-spinner" aria-hidden="true" />
          <!-- #19: visually-hidden aria-live status text — the spinner above stays
               aria-hidden (purely decorative); this is the actual AT-perceivable signal. -->
          <span class="v6-cmp__chip-status" role="status" aria-live="polite">{{ chipStatusText(att) }}</span>
          <button
            type="button"
            class="v6-cmp__chip-remove"
            :aria-label="`移除 ${att.name}`"
            data-testid="v6-composer-attach-remove"
            @click="emit('attach-remove', att.id)"
          >×</button>
        </div>
      </div>
      <div v-if="$slots.mention" class="v6-cmp__mention">
        <slot name="mention" />
      </div>
      <textarea
        ref="textareaRef"
        class="v6-cmp-in"
        rows="1"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        aria-label="消息输入"
        data-testid="v6-composer-input"
        @input="onInput"
        @paste="onPaste"
        @keydown.enter.exact.prevent="submit"
      />
      <div class="v6-cmp-bar">
        <button
          v-if="allowAttach"
          type="button"
          class="v6-cmp-attach"
          :disabled="disabled"
          data-testid="v6-composer-attach-btn"
          aria-label="添加图片"
          @click="openFilePicker"
        >📎</button>
        <input
          v-if="allowAttach"
          ref="fileInputRef"
          type="file"
          accept="image/*"
          multiple
          hidden
          data-testid="v6-composer-attach-input"
          @change="onFileInputChange"
        />
        <span class="v6-cmp-hint">/ 技能</span>
        <span class="v6-cmp-hint">@ 文件</span>
        <span class="v6-cmp-hint">⌘↵</span>
        <button
          type="button"
          class="v6-cmp-send"
          :disabled="disabled || canSend === false || !modelValue.trim()"
          data-testid="v6-composer-send"
          aria-label="发送"
          @click="submit"
        >↑</button>
      </div>
      <div v-if="$slots.envrow" class="v6-envrow">
        <slot name="envrow" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.v6-cmp {
  border-top: 1px solid var(--dw-bd);
  background: var(--dw-sf);
  padding: 10px 14px;
  flex-shrink: 0;
  position: relative;
}
.v6-cmp-box {
  background: var(--dw-sf2);
  border: 1px solid var(--dw-bd);
  border-radius: var(--dw-r3);
  padding: 9px 12px 7px;
}
.v6-cmp-box:focus-within { border-color: var(--dw-ac-border-focus); }
.v6-cmp__mention { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 6px; }
.v6-cmp-in {
  width: 100%;
  resize: none;
  font-size: 13px;
  line-height: 1.5;
  min-height: 21px;
  max-height: 180px;
  border: 0;
  background: transparent;
  color: var(--dw-fg);
  outline: none;
  font-family: inherit;
  /* OD3: auto-grow — 无溢出不显滚条，超过 max-height(~8行)才出现；gutter stable 防止
     出现/消失时文字横向跳动。JS onInput 同步设置 height = min(scrollHeight, 180)。 */
  overflow-y: auto;
  scrollbar-gutter: stable;
}
.v6-cmp-in::placeholder { color: var(--dw-mu); }
.v6-cmp-bar {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 7px;
}
.v6-cmp-hint {
  font-family: var(--dw-mono);
  font-size: 10px;
  color: var(--dw-mu);
}
.v6-cmp-send {
  width: 28px;
  height: 28px;
  border-radius: var(--dw-r2);
  background: var(--dw-ac);
  color: var(--dw-on-accent);
  display: grid;
  place-items: center;
  margin-left: auto;
  border: 0;
  cursor: pointer;
  font-size: 14px;
}
.v6-cmp-send:disabled { background: var(--dw-sf3); color: var(--dw-mu); cursor: not-allowed; }
.v6-envrow {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 7px;
  flex-wrap: wrap;
}

/* R1 图片附件位 */
.v6-cmp-attach {
  position: relative;
  width: 28px;
  height: 28px;
  border-radius: var(--dw-r2);
  background: transparent;
  color: var(--dw-mu);
  display: grid;
  place-items: center;
  border: 0;
  cursor: pointer;
  font-size: 14px;
  flex-shrink: 0;
}
/* 视觉 28px，命中区靠 ::after 扩到 ~40px（触摸目标下限），不占布局 */
.v6-cmp-attach::after {
  content: '';
  position: absolute;
  inset: -6px;
}
.v6-cmp-attach:hover { background: var(--dw-sf3); color: var(--dw-fg); }
.v6-cmp-attach:disabled { color: var(--dw-mu); cursor: not-allowed; opacity: .5; }

.v6-cmp__attachments {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 6px;
  max-height: 32px;
  overflow-x: auto;
  overflow-y: hidden;
  margin-bottom: 6px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
}
.v6-cmp__chip {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  max-width: 160px;
  height: 24px;
  padding: 0 6px 0 2px;
  border: 1px solid var(--dw-bd);
  border-radius: var(--dw-r2);
  background: var(--dw-sf3);
}
.v6-cmp__chip--error { border-color: var(--dw-red); }
.v6-cmp__chip-thumb {
  width: 18px;
  height: 18px;
  border-radius: 3px;
  object-fit: cover;
  flex-shrink: 0;
}
.v6-cmp__chip-thumb--ph {
  display: grid;
  place-items: center;
  font-size: 11px;
  background: var(--dw-sf2);
}
.v6-cmp__chip-name {
  font-size: 11px;
  color: var(--dw-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 88px;
}
/* codex-review-r1 #19: visually-hidden but announced by AT (standard clip technique —
   NOT display:none/visibility:hidden, both of which are silently dropped from the
   accessibility tree too). */
.v6-cmp__chip-status {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.v6-cmp__chip-spinner {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1.5px solid var(--dw-mu);
  border-top-color: transparent;
  flex-shrink: 0;
  animation: v6-cmp-spin 0.7s linear infinite;
}
@keyframes v6-cmp-spin { to { transform: rotate(360deg); } }
.v6-cmp__chip-remove {
  position: relative;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 0;
  background: transparent;
  color: var(--dw-mu);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
  display: grid;
  place-items: center;
}
/* 视觉 14px，命中区靠 ::after 扩到 ~40px（触摸目标下限），不占布局 */
.v6-cmp__chip-remove::after {
  content: '';
  position: absolute;
  inset: -13px;
}
.v6-cmp__chip-remove:hover { color: var(--dw-fg); }
</style>
