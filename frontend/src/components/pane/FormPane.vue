<script setup lang="ts">
import { ref, computed } from 'vue'
import PaneShell from './PaneShell.vue'
import type { PaneShellProps } from './PaneShell.vue'
import { ScrollArea } from '@ce/components/ui/scroll-area'
import { Button } from '@ce/components/ui/button'

export interface FormField {
  id: string
  type: 'text' | 'select' | 'toggle' | 'textarea' | 'credential' | 'file-path'
  label: string
  placeholder?: string
  required?: boolean
  options?: { label: string; value: string }[]
  modelValue?: any
}

export interface FormSection {
  id: string
  title: string
  fields: FormField[]
  visible?: boolean
}

interface FormPaneProps {
  mode?: 'page' | 'wizard' | 'inline'
  sections: FormSection[]
  currentStep?: number
  loading?: boolean
  emptyState?: PaneShellProps['emptyState']
  title?: string
}

const props = withDefaults(defineProps<FormPaneProps>(), {
  mode: 'page',
  currentStep: 0,
  loading: false,
})

const emit = defineEmits<{
  'submit': []
  'cancel': []
  'step-change': [step: number]
}>()

defineSlots<{
  field(props: { field: FormField; modelValue: any; updateValue: (v: any) => void }): any
  actions(): any
  'step-indicator'(): any
  empty(): any
}>()

const fieldValues = ref<Record<string, any>>({})

function getFieldValue(field: FormField) {
  return field.id in fieldValues.value ? fieldValues.value[field.id] : field.modelValue
}

function updateFieldValue(field: FormField, value: any) {
  fieldValues.value[field.id] = value
}

const visibleSections = computed(() => {
  if (props.mode === 'wizard') {
    const section = props.sections[props.currentStep]
    return section ? [section] : []
  }
  return props.sections.filter(s => s.visible !== false)
})

function nextStep() {
  if (props.currentStep < props.sections.length - 1) {
    emit('step-change', props.currentStep + 1)
  } else {
    emit('submit')
  }
}

function prevStep() {
  if (props.currentStep > 0) {
    emit('step-change', props.currentStep - 1)
  }
}

const isLastStep = computed(() => props.currentStep >= props.sections.length - 1)

const inputClass =
  'w-full px-2 py-1.5 text-sm bg-background border border-input rounded focus:outline-none focus:ring-1 focus:ring-ring'
</script>

<template>
  <PaneShell
    :title="title"
    :empty-state="emptyState"
    class="flex-1"
  >
    <template #empty>
      <slot name="empty" />
    </template>

    <div class="flex flex-col flex-1 overflow-hidden">
      <!-- Step indicator (wizard) -->
      <div
        v-if="mode === 'wizard' && $slots['step-indicator']"
        class="shrink-0 px-3 py-2 border-b border-border"
      >
        <slot name="step-indicator" />
      </div>
      <div
        v-else-if="mode === 'wizard'"
        class="shrink-0 flex items-center gap-1 px-3 py-2 border-b border-border"
      >
        <template v-for="(section, idx) in sections" :key="section.id">
          <div
            class="flex items-center gap-1 text-xs"
            :class="idx === currentStep ? 'text-primary font-medium' : 'text-muted-foreground'"
          >
            <div
              class="size-5 rounded-full flex items-center justify-center text-xs border"
              :class="idx === currentStep
                ? 'border-primary bg-primary text-primary-foreground'
                : idx < currentStep
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-muted-foreground/30'"
            >{{ idx + 1 }}</div>
            <span class="hidden sm:inline">{{ section.title }}</span>
          </div>
          <div v-if="idx < sections.length - 1" class="flex-1 h-px bg-border mx-1" />
        </template>
      </div>

      <!-- Fields -->
      <ScrollArea class="flex-1">
        <div
          :class="{
            'p-4 space-y-6': mode === 'page' || mode === 'wizard',
            'p-2 space-y-3': mode === 'inline',
          }"
        >
          <template v-for="section in visibleSections" :key="section.id">
            <div>
              <h3
                v-if="mode !== 'inline'"
                class="text-sm font-semibold text-foreground mb-3"
              >{{ section.title }}</h3>
              <div class="space-y-3">
                <template v-for="field in section.fields" :key="field.id">
                  <!-- Custom field slot or default renderer -->
                  <div v-if="$slots.field">
                    <slot
                      name="field"
                      :field="field"
                      :model-value="getFieldValue(field)"
                      :update-value="(v: any) => updateFieldValue(field, v)"
                    />
                  </div>
                  <div v-else class="space-y-1">
                    <label class="text-xs font-medium text-foreground">
                      {{ field.label }}
                      <span v-if="field.required" class="text-destructive ml-0.5">*</span>
                    </label>

                    <textarea
                      v-if="field.type === 'textarea'"
                      :class="inputClass"
                      :placeholder="field.placeholder"
                      :value="getFieldValue(field)"
                      rows="3"
                      @input="updateFieldValue(field, ($event.target as HTMLTextAreaElement).value)"
                    />

                    <select
                      v-else-if="field.type === 'select'"
                      :class="inputClass"
                      :value="getFieldValue(field)"
                      @change="updateFieldValue(field, ($event.target as HTMLSelectElement).value)"
                    >
                      <option
                        v-for="opt in field.options"
                        :key="opt.value"
                        :value="opt.value"
                      >{{ opt.label }}</option>
                    </select>

                    <label
                      v-else-if="field.type === 'toggle'"
                      class="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        class="rounded border-input"
                        :checked="getFieldValue(field)"
                        @change="updateFieldValue(field, ($event.target as HTMLInputElement).checked)"
                      />
                      <span class="text-xs text-muted-foreground">{{ field.placeholder }}</span>
                    </label>

                    <input
                      v-else
                      :class="inputClass"
                      :type="field.type === 'credential' ? 'password' : 'text'"
                      :placeholder="field.placeholder"
                      :value="getFieldValue(field)"
                      @input="updateFieldValue(field, ($event.target as HTMLInputElement).value)"
                    />
                  </div>
                </template>
              </div>
            </div>
          </template>
        </div>
      </ScrollArea>

      <!-- Actions -->
      <div class="shrink-0 border-t border-border px-3 py-2 flex items-center justify-between gap-2">
        <slot name="actions">
          <div class="flex gap-2">
            <Button
              v-if="mode === 'wizard' && currentStep > 0"
              variant="ghost"
              size="sm"
              @click="prevStep"
            >Back</Button>
            <Button variant="outline" size="sm" @click="emit('cancel')">Cancel</Button>
          </div>
          <Button size="sm" :disabled="loading" @click="mode === 'wizard' ? nextStep() : emit('submit')">
            <span v-if="loading" class="animate-pulse">Saving...</span>
            <span v-else-if="mode === 'wizard' && !isLastStep">Next</span>
            <span v-else>Save</span>
          </Button>
        </slot>
      </div>
    </div>
  </PaneShell>
</template>
