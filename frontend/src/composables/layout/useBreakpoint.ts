import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { Breakpoint, Platform } from './types'

export type { Breakpoint, Platform }

export interface BreakpointState {
  breakpoint: Ref<Breakpoint>
  isMobile: ComputedRef<boolean>
  isTablet: ComputedRef<boolean>
  isDesktop: ComputedRef<boolean>
  platform: Ref<Platform>
  titleBarInset: ComputedRef<{ top: number; left: number }>
  viewportWidth: Ref<number>
}

function detectBreakpoint(width: number): Breakpoint {
  if (width < 768) return 'mobile'
  if (width <= 1024) return 'tablet'
  return 'desktop'
}

function detectPlatform(): Platform {
  const w = window as any
  if (w.__wails || w.wails) {
    // Distinguish macOS vs Windows by user agent
    return /Mac/i.test(navigator.platform || navigator.userAgent)
      ? 'wails-macos'
      : 'wails-windows'
  }
  return 'browser'
}

const TITLE_BAR_INSETS: Record<Platform, { top: number; left: number }> = {
  'wails-macos':   { top: 28, left: 70 },
  'wails-windows': { top: 32, left: 0 },
  'browser':       { top: 0,  left: 0 },
}

export function useBreakpoint(): BreakpointState {
  const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1280)
  const breakpoint = ref<Breakpoint>(detectBreakpoint(viewportWidth.value))
  const platform = ref<Platform>('browser')

  const isMobile  = computed(() => breakpoint.value === 'mobile')
  const isTablet  = computed(() => breakpoint.value === 'tablet')
  const isDesktop = computed(() => breakpoint.value === 'desktop')
  const titleBarInset = computed(() => TITLE_BAR_INSETS[platform.value])

  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  function onResize() {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      viewportWidth.value = window.innerWidth
      breakpoint.value = detectBreakpoint(window.innerWidth)
    }, 100)
  }

  onMounted(() => {
    platform.value = detectPlatform()
    viewportWidth.value = window.innerWidth
    breakpoint.value = detectBreakpoint(window.innerWidth)
    window.addEventListener('resize', onResize)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', onResize)
    if (debounceTimer) clearTimeout(debounceTimer)
  })

  return { breakpoint, isMobile, isTablet, isDesktop, platform, titleBarInset, viewportWidth }
}
