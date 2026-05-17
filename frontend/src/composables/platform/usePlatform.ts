import { ref, computed, onMounted, onUnmounted, inject } from 'vue'

export type PlatformKind = 'wails-macos' | 'wails-windows' | 'browser-desktop' | 'browser-mobile'

export interface PlatformContext {
  kind: PlatformKind
  isWails: boolean
  isMobile: boolean
  isFloating: boolean
  titleBarHeight: number
  trafficLightInset: number
  safeAreaBottom: number
  capabilities: {
    nativeFloatingWindow: boolean
    nativeNotification: boolean
    fileSystemAccess: boolean
    dragResize: boolean
  }
}

// Per-kind static metadata
const KIND_META: Record<
  PlatformKind,
  Pick<PlatformContext, 'titleBarHeight' | 'trafficLightInset' | 'safeAreaBottom' | 'capabilities'>
> = {
  'wails-macos': {
    titleBarHeight: 28,
    trafficLightInset: 70,
    safeAreaBottom: 0,
    capabilities: {
      nativeFloatingWindow: true,
      nativeNotification: true,
      fileSystemAccess: true,
      dragResize: true,
    },
  },
  'wails-windows': {
    titleBarHeight: 32,
    trafficLightInset: 0,
    safeAreaBottom: 0,
    capabilities: {
      nativeFloatingWindow: true,
      nativeNotification: true,
      fileSystemAccess: true,
      dragResize: true,
    },
  },
  'browser-desktop': {
    titleBarHeight: 0,
    trafficLightInset: 0,
    safeAreaBottom: 0,
    capabilities: {
      nativeFloatingWindow: false,
      nativeNotification: false,
      fileSystemAccess: false,
      dragResize: false,
    },
  },
  'browser-mobile': {
    titleBarHeight: 0,
    trafficLightInset: 0,
    safeAreaBottom: 34, // approximation; env(safe-area-inset-bottom) is handled via CSS
    capabilities: {
      nativeFloatingWindow: false,
      nativeNotification: false,
      fileSystemAccess: false,
      dragResize: false,
    },
  },
}

function detectKind(isMobileViewport: boolean): PlatformKind {
  const w = window as any
  if (w.__wails || w.wails) {
    return /Mac/i.test(navigator.platform || navigator.userAgent)
      ? 'wails-macos'
      : 'wails-windows'
  }
  return isMobileViewport ? 'browser-mobile' : 'browser-desktop'
}

export function usePlatform(): PlatformContext {
  const isFloating = inject('floating-portal', false) as boolean

  const isMobileViewport = ref(
    typeof window !== 'undefined' ? window.innerWidth <= 767 : false,
  )
  const kind = ref<PlatformKind>('browser-desktop')

  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  function onResize() {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      isMobileViewport.value = window.innerWidth <= 767
      kind.value = detectKind(isMobileViewport.value)
    }, 100)
  }

  onMounted(() => {
    isMobileViewport.value = window.innerWidth <= 767
    kind.value = detectKind(isMobileViewport.value)
    window.addEventListener('resize', onResize)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', onResize)
    if (debounceTimer) clearTimeout(debounceTimer)
  })

  const isWails = computed(() => kind.value === 'wails-macos' || kind.value === 'wails-windows')
  const isMobile = computed(() => kind.value === 'browser-mobile')
  const meta = computed(() => KIND_META[kind.value])

  return {
    get kind() { return kind.value },
    get isWails() { return isWails.value },
    get isMobile() { return isMobile.value },
    isFloating,
    get titleBarHeight() { return meta.value.titleBarHeight },
    get trafficLightInset() { return meta.value.trafficLightInset },
    get safeAreaBottom() { return meta.value.safeAreaBottom },
    get capabilities() { return meta.value.capabilities },
  }
}
