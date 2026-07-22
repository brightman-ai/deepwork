<script setup lang="ts">
// ImageLightbox — ws-ux-pro 诉求 E(点击放大)/G2(已发消息内图片预览): 自包含、零外部
// 依赖的全屏图片预览 primitive。任何 assistant-stream 消费点（UserBubble 消息内缩略图 /
// composer chip 缩略图…）都可以独立挂载它 —— 参照 deepwork-terminal ResourceDrawer 的
// lightbox 子模式（.rd-lightbox：遮罩点击关闭 + object-fit 适配尺寸），但拆成一个不携带
// ResourceDrawer 其它状态（拖拽缩放/pinch-zoom/文件面板）的独立组件，因为这里的验收只要
// "点击放大可看清、可关闭"（非目标：图片编辑/pinch-zoom），复用 ResourceDrawer 整个大组件
// 会引入大量与本场景无关的状态。
//
// 契约：挂载 = 显示（调用方用 `v-if="src"` 控制存在性），@close = 调用方把 src 置空。
// 关闭途径：点击遮罩(非图片区域) / Esc / 右上角 × 按钮——三选一，桌面/移动都够用。
import { onBeforeUnmount, onMounted, ref } from 'vue'

withDefaults(defineProps<{
  /** 图片可访问 URL（调用方已经把 rel_path 解析成 URL；本组件不做路径/权限判断）。 */
  src: string
  /** 可选说明文字（文件名/引用路径），显示在图片下方并作为 aria-label。 */
  alt?: string
}>(), {
  alt: '',
})

const emit = defineEmits<{
  (e: 'close'): void
}>()

const dialogRef = ref<HTMLElement>()
let previouslyFocused: HTMLElement | null = null

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close')
}

// 最小 a11y：打开时把焦点挪进对话框（屏幕阅读器能宣读 role=dialog），关闭时还给触发它
// 的元素（通常是缩略图按钮）——不做完整 focus-trap（Tab 循环），这是一个内容单一的只读
// 预览层，过度工程与本任务"仅点击放大预览"的非目标相悖。
onMounted(() => {
  previouslyFocused = document.activeElement as HTMLElement | null
  window.addEventListener('keydown', onKeydown)
  dialogRef.value?.focus()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  previouslyFocused?.focus?.()
})
</script>

<template>
  <Teleport to="body">
    <div
      class="ail-backdrop"
      data-testid="image-lightbox"
      @click.self="emit('close')"
    >
      <div
        ref="dialogRef"
        class="ail-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="alt || '图片预览'"
        tabindex="-1"
      >
        <button
          type="button"
          class="ail-close"
          aria-label="关闭预览"
          data-testid="image-lightbox-close"
          @click="emit('close')"
        >×</button>
        <img class="ail-img" :src="src" :alt="alt" draggable="false" />
        <div v-if="alt" class="ail-caption">{{ alt }}</div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ail-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000; /* 高于本仓已知最高的 popover/scroll 层(70) —— 必须盖住一切应用 chrome */
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(16px, env(safe-area-inset-top, 16px)) 16px
           calc(env(safe-area-inset-bottom, 0px) + 16px);
  background: oklch(0% 0 0 / 0.78);
  animation: ail-fade 0.15s ease;
}
@keyframes ail-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .ail-backdrop { animation: none; }
}

.ail-dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  max-width: 100%;
  max-height: 100%;
  outline: none; /* 焦点态用对话框本身的可见结构表达，不需要默认焦点框 */
}

.ail-img {
  max-width: min(94vw, 1400px);
  max-height: 82vh;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: var(--dw-r2, 8px);
  box-shadow: var(--dw-shadow-pop, 0 6px 18px oklch(0% 0 0 / 0.5));
  -webkit-user-select: none;
  user-select: none;
  -webkit-user-drag: none;
}

.ail-caption {
  max-width: 90vw;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--dw-sf2, #1c1c1f);
  border: 1px solid var(--dw-bd, #252528);
  color: var(--dw-mu, #6b6b72);
  font-family: var(--dw-mono, monospace);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 固定在视口右上角（而非对话框角落）——图片尺寸从很小(正方缩略图放大)到接近全屏都不等,
   贴对话框角落在小图时会紧贴图片边缘、在大图时可能跑出安全区；贴视口角落对两种尺寸都稳。 */
.ail-close {
  position: fixed;
  top: max(12px, env(safe-area-inset-top, 12px));
  right: 12px;
  z-index: 1;
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid var(--dw-bd, #252528);
  background: var(--dw-sf2, #1c1c1f);
  color: var(--dw-fg, #e8e8ec);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}
.ail-close:hover { background: var(--dw-sf3, #232327); border-color: var(--dw-ac, currentColor); }
</style>
