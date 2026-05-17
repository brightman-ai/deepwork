import { ref, watch } from 'vue'
import type { Ref } from 'vue'
import { useBreakpoint } from './useBreakpoint'
import type { Breakpoint, PanePreference } from './types'

export type { PanePreference }

type PreferenceMap = Record<string, PanePreference>

function storageKey(portal: string, scenario: string, device: Breakpoint): string {
  return `dw-pane-pref:${portal}:${scenario}:${device}`
}

function loadPrefs(key: string): PreferenceMap {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as PreferenceMap) : {}
  } catch {
    return {}
  }
}

function savePrefs(key: string, prefs: PreferenceMap): void {
  try {
    localStorage.setItem(key, JSON.stringify(prefs))
  } catch { /* ignore quota errors */ }
}

export interface DontDisturbResult {
  isClosed: (slot: string) => boolean
  close:    (slot: string) => void
  open:     (slot: string) => void
  pin:      (slot: string) => void
  unpin:    (slot: string) => void
  getWidth: (slot: string) => number | undefined
  setWidth: (slot: string, width: number) => void
}

export function useDontDisturb(portalId: string, scenario: Ref<string>): DontDisturbResult {
  const { breakpoint } = useBreakpoint()
  const prefs = ref<PreferenceMap>({})

  function currentKey(): string {
    return storageKey(portalId, scenario.value, breakpoint.value)
  }

  function reload(): void {
    prefs.value = loadPrefs(currentKey())
  }

  function persist(): void {
    savePrefs(currentKey(), prefs.value)
  }

  function getOrCreate(slot: string): PanePreference {
    if (!prefs.value[slot]) {
      prefs.value[slot] = {
        portal: portalId,
        scenario: scenario.value,
        slot,
        device: breakpoint.value,
        manuallyClosed: false,
      }
    }
    return prefs.value[slot]
  }

  // Reload when scenario or breakpoint changes
  watch([scenario, breakpoint], reload, { immediate: true })

  function isClosed(slot: string): boolean {
    return prefs.value[slot]?.manuallyClosed ?? false
  }

  function close(slot: string): void {
    const p = getOrCreate(slot)
    p.manuallyClosed = true
    p.lastClosedAt = Date.now()
    persist()
  }

  function open(slot: string): void {
    const p = getOrCreate(slot)
    p.manuallyClosed = false
    persist()
  }

  function pin(slot: string): void {
    getOrCreate(slot).pinned = true
    persist()
  }

  function unpin(slot: string): void {
    getOrCreate(slot).pinned = false
    persist()
  }

  function getWidth(slot: string): number | undefined {
    return prefs.value[slot]?.width
  }

  function setWidth(slot: string, width: number): void {
    getOrCreate(slot).width = width
    persist()
  }

  return { isClosed, close, open, pin, unpin, getWidth, setWidth }
}
