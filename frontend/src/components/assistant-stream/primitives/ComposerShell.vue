<script setup lang="ts">
// CHG-014 D3: cmp 输入器壳 (原型 1021-1037/1151-1156)。
// mention 行槽 (slot) + textarea (v-model) + cmp-bar (/技能 @文件 ⌘↵ + amber 圆发送)
// + envrow 槽 (slot=envrow，放 EnvChip)。纯壳，发送/技能/文件逻辑由装配方接。
import { nextTick, ref } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  disabled?: boolean
  canSend?: boolean
}>(), {
  placeholder: '追加指令… / 技能 · @ 文件',
  disabled: false,
  canSend: true,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'send'): void
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)

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

defineExpose({
  focus() { nextTick(() => textareaRef.value?.focus()) },
})
</script>

<template>
  <div class="v6-cmp" data-testid="v6-composer">
    <div class="v6-cmp-box">
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
        @keydown.enter.exact.prevent="submit"
      />
      <div class="v6-cmp-bar">
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
</style>
