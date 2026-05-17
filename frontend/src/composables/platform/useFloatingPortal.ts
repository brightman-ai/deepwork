import { inject } from 'vue'

export function useFloatingPortal() {
  const isFloating = inject('floating-portal', false) as boolean

  return {
    isFloating,
    pattern: 'solo' as const,
    maxWidth: 480,
    density: 'compact' as const,
    escapeAction: 'hide' as const,
  }
}
