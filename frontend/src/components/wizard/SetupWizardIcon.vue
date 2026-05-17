<template>
  <button
    class="flex items-center gap-1 px-2 py-1 text-xs rounded-full border bg-background/80 backdrop-blur hover:bg-accent transition-colors flex-shrink-0"
    :class="{ 'border-destructive text-destructive': hasError }"
    :title="`设置向导：${configured} / ${total} 已配置`"
    @click="togglePanel"
  >
    <span>⚙</span>
    <span>{{ configured }}/{{ total }}</span>
    <span v-if="hasError" class="w-1.5 h-1.5 rounded-full bg-destructive ml-0.5" />
  </button>

  <Teleport to="body">
    <Transition name="slide-right">
      <div
        v-if="showPanel"
        class="fixed top-0 right-0 z-[90] h-full w-[320px] bg-background border-l shadow-xl flex flex-col"
      >
        <!-- 面板头部 -->
        <div class="flex justify-between items-center px-4 py-3 border-b shrink-0">
          <h2 class="font-semibold text-sm">设置向导</h2>
          <button
            class="text-muted-foreground hover:text-foreground text-base leading-none"
            @click="showPanel = false"
          >
            ✕
          </button>
        </div>

        <!-- 步骤列表 -->
        <div class="flex-1 overflow-y-auto p-3 space-y-2">
          <!-- 按 category 分组 -->
          <template v-for="(group, category) in groupedSteps" :key="category">
            <div class="text-xs text-muted-foreground font-medium px-1 pt-2 pb-1">
              {{ categoryLabel(category) }}
            </div>
            <div
              v-for="step in group"
              :key="step.id"
              class="border rounded-lg p-3 space-y-1.5"
              :class="{ 'border-destructive/60': step.status === 'error' }"
            >
              <div class="flex justify-between items-center">
                <span class="text-sm font-medium">{{ step.title }}</span>
                <span class="text-xs font-medium" :class="statusClass(step.status)">
                  {{ statusLabel(step.status) }}
                </span>
              </div>
              <p class="text-xs text-muted-foreground">{{ step.description }}</p>
              <div class="flex gap-2 pt-0.5">
                <button
                  class="text-xs px-2 py-1 rounded border hover:bg-accent transition-colors disabled:opacity-50"
                  :disabled="testingId === step.id"
                  @click="testStep(step.id)"
                >
                  {{ testingId === step.id ? '测试中…' : '测试' }}
                </button>
                <button
                  v-if="step.status !== 'configured'"
                  class="text-xs px-2 py-1 rounded border hover:bg-accent transition-colors"
                  @click="configureStep(step.id)"
                >
                  配置
                </button>
              </div>
              <!-- 测试结果 -->
              <div
                v-if="testResults[step.id]"
                class="text-xs mt-1 px-2 py-1 rounded"
                :class="testResults[step.id].success ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'"
              >
                {{ testResults[step.id].message }}
                <span v-if="testResults[step.id].preview" class="block opacity-75 mt-0.5">
                  {{ testResults[step.id].preview }}
                </span>
              </div>
            </div>
          </template>

          <!-- 空状态 -->
          <div v-if="steps.length === 0 && !loading" class="text-xs text-muted-foreground text-center py-8">
            暂无配置项
          </div>
          <div v-if="loading" class="text-xs text-muted-foreground text-center py-8">
            加载中…
          </div>
        </div>

        <!-- 面板底部 -->
        <div class="border-t px-4 py-3 shrink-0">
          <button
            class="w-full text-xs px-3 py-1.5 rounded border hover:bg-accent transition-colors disabled:opacity-50"
            :disabled="loading"
            @click="testAll"
          >
            全部测试
          </button>
        </div>
      </div>
    </Transition>

    <!-- 遮罩 -->
    <Transition name="fade">
      <div
        v-if="showPanel"
        class="fixed inset-0 z-[89] bg-black/20"
        @click="showPanel = false"
      />
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

const props = defineProps<{ inline?: boolean }>()

interface StepSummary {
  id: string
  title: string
  description: string
  category: 'permission' | 'api_key' | 'feature'
  platform: 'all' | 'macos' | 'windows'
  priority: number
  depends_on: string[]
  status: 'configured' | 'not_configured' | 'error' | 'skipped'
}

interface TestResult {
  success: boolean
  message: string
  preview?: string
}

const showPanel = ref(false)
const loading = ref(false)
const steps = ref<StepSummary[]>([])
const testResults = ref<Record<string, TestResult>>({})
const testingId = ref<string | null>(null)

const configured = computed(() => steps.value.filter(s => s.status === 'configured').length)
const total = computed(() => steps.value.filter(s => s.status !== 'skipped').length)
const hasError = computed(() => steps.value.some(s => s.status === 'error'))

const groupedSteps = computed(() => {
  const groups: Record<string, StepSummary[]> = {}
  for (const step of steps.value) {
    if (!groups[step.category]) groups[step.category] = []
    groups[step.category].push(step)
  }
  return groups
})

function togglePanel() {
  showPanel.value = !showPanel.value
  if (showPanel.value) fetchSteps()
}

async function fetchSteps() {
  loading.value = true
  try {
    const res = await fetch('/api/setup/steps')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    steps.value = (data.steps ?? []).sort((a: StepSummary, b: StepSummary) => a.priority - b.priority)
  } catch (e) {
    console.error('[SetupWizardIcon] fetchSteps error:', e)
  } finally {
    loading.value = false
  }
}

async function testStep(id: string) {
  testingId.value = id
  try {
    const res = await fetch(`/api/setup/steps/${id}/test`, { method: 'POST' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    testResults.value = { ...testResults.value, [id]: data.result }
    // 刷新状态
    await fetchSteps()
  } catch (e) {
    testResults.value = { ...testResults.value, [id]: { success: false, message: String(e) } }
  } finally {
    testingId.value = null
  }
}

async function configureStep(id: string) {
  try {
    const res = await fetch(`/api/setup/steps/${id}/configure`, { method: 'POST' })
    if (!res.ok) return
    const data = await res.json()
    if (data.guide?.url) {
      // 打开系统设置深链（macOS）或跳转外部 URL
      window.open(data.guide.url, '_blank')
    }
  } catch (e) {
    console.error('[SetupWizardIcon] configureStep error:', e)
  }
}

async function testAll() {
  for (const step of steps.value) {
    await testStep(step.id)
  }
}

function statusClass(status: string) {
  switch (status) {
    case 'configured': return 'text-green-600 dark:text-green-400'
    case 'not_configured': return 'text-muted-foreground'
    case 'error': return 'text-destructive'
    case 'skipped': return 'text-muted-foreground/60'
    default: return ''
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'configured': return '✓ 已配置'
    case 'not_configured': return '未配置'
    case 'error': return '⚠ 异常'
    case 'skipped': return '已跳过'
    default: return status
  }
}

function categoryLabel(category: string) {
  switch (category) {
    case 'permission': return '权限'
    case 'api_key': return 'API Key'
    case 'feature': return '功能'
    default: return category
  }
}

onMounted(() => {
  fetchSteps()
})
</script>

<style scoped>
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.25s ease;
}
.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
