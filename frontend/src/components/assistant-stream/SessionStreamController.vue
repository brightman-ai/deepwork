<template>
  <AssistantStreamSurface
    ref="paneRef"
    v-bind="controller.surfaceProps.value"
    :session-id="liveSessionId"
    :title="title"
    :eyebrow="eyebrow"
    :status-label="controller.statusLabel.value"
    :status-tone="controller.statusTone.value"
    :context-items="contextItems"
    :launcher-items="launcherItems"
    :empty-title="emptyTitle"
    :empty-hint="emptyHint"
    :placeholder="placeholder"
    :composer-meta="composerMeta"
    :disabled="disabled"
    :density="density"
    @send="handleSend"
    @clear-error="controller.error.value = ''"
  >
    <template #assistantActions="slotProps">
      <slot name="assistantActions" v-bind="slotProps" />
    </template>
    <template #headerActions>
      <slot name="headerActions" />
    </template>
    <template #composerPrefix>
      <slot name="composerPrefix" />
    </template>
  </AssistantStreamSurface>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import AssistantStreamSurface from './AssistantStreamSurface.vue'
import type {
  AssistantContextItem,
  AssistantDensity,
  AssistantLauncherItem,
} from './types'
import { useWorkstreamController } from '@ce/composables/channel/useWorkstreamController'
import { DefaultSessionStrategy } from '@ce/composables/channel/strategies/DefaultSessionStrategy'

const props = withDefaults(defineProps<{
  sessionId?: number | null
  createPayload?: Record<string, unknown> | null
  title?: string
  eyebrow?: string
  contextItems?: AssistantContextItem[]
  launcherItems?: AssistantLauncherItem[]
  emptyTitle?: string
  emptyHint?: string
  placeholder?: string
  composerMeta?: string
  disabled?: boolean
  density?: AssistantDensity
  toolMode?: string
  allowedTools?: string[]
  memoryOn?: boolean
  active?: boolean
  historyParams?: Record<string, string | number | boolean | undefined>
  buildInput?: (text: string) => string | Promise<string>
}>(), {
  sessionId: null,
  createPayload: null,
  title: '会话',
  eyebrow: '',
  contextItems: () => [],
  launcherItems: () => [],
  emptyTitle: '开始对话',
  emptyHint: '输入问题，AI 会在这里展示过程和结果。',
  placeholder: '输入消息...',
  composerMeta: '',
  disabled: false,
  density: 'regular',
  toolMode: '',
  allowedTools: () => [],
  memoryOn: undefined,
  active: true,
  historyParams: () => ({}),
})

const emit = defineEmits<{
  (e: 'session-created', id: number): void
  (e: 'turn-completed', id: number): void
}>()

const paneRef = ref<InstanceType<typeof AssistantStreamSurface> | null>(null)
const liveSessionId = ref<number | null>(props.sessionId ?? null)
const localActive = ref(props.active)

const strategy = new DefaultSessionStrategy({
  sessionIdRef: liveSessionId,
  activeRef: localActive,
  createPayload: () => props.createPayload ?? null,
  historyParams: () => props.historyParams ?? {},
  toolMode: () => props.toolMode ?? '',
  allowedTools: () => props.allowedTools ?? [],
  memoryOn: () => props.memoryOn,
  onSessionCreated: (id) => {
    emit('session-created', id)
  },
})

const controller = useWorkstreamController({
  strategy,
  paneRef,
  onSideEffect: (kind) => {
    if (kind === 'turn-completed' && liveSessionId.value) {
      emit('turn-completed', liveSessionId.value)
    }
  },
})

async function handleSend(text: string): Promise<void> {
  const inputText = props.buildInput ? await props.buildInput(text) : text
  await controller.send(inputText)
  void nextTick(() => paneRef.value?.focus())
}

watch(
  () => props.sessionId,
  async (id, previous) => {
    const nextID = id ?? null
    const freshHydration = !previous && nextID && (controller.streaming.value || controller.messages.value.length > 0)
    liveSessionId.value = nextID
    controller.error.value = ''
    if (freshHydration) return
    controller.messages.value = []
    if (nextID) await controller.loadHistory(nextID)
  },
  { immediate: true },
)

watch(() => props.active, (active) => {
  localActive.value = active
})

// createPayload, toolMode, allowedTools, memoryOn, historyParams are read via
// strategy at call time through props references — no need to watch them.

defineExpose({
  setDraft(text: string) {
    paneRef.value?.setDraft(text)
  },
  focus() {
    paneRef.value?.focus()
  },
  scrollToBottom(force = false) {
    paneRef.value?.scrollToBottom(force)
  },
})
</script>
