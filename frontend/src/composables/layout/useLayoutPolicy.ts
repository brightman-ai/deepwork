import { ref } from 'vue'
import type { Ref } from 'vue'
import type { LayoutEffect, LayoutPolicyContext } from './types'

export type { LayoutEffect, LayoutPolicyContext }

export type EffectHandler = (ctx: LayoutPolicyContext, payload?: unknown) => LayoutEffect | null

export interface LayoutPolicyConfig {
  effects: Record<string, EffectHandler>
}

export interface LayoutPolicyResult {
  slotExpanded: Ref<Record<string, boolean>>
  slotBadges:   Ref<Record<string, number>>
  processEvent: (eventName: string, payload?: unknown) => void
  manualClose:  (slot: string) => void
  manualOpen:   (slot: string) => void
  /** Reset explicit expanded state for a slot (e.g. on session switch),
   *  so initialState in the new scenario takes effect. */
  resetSlotExpanded: (slot: string) => void
}

export function useLayoutPolicy(config: LayoutPolicyConfig): LayoutPolicyResult {
  const slotExpanded   = ref<Record<string, boolean>>({})
  const slotBadges     = ref<Record<string, number>>({})
  const manuallyClosed = ref<Set<string>>(new Set())

  function userManuallyClosed(slot: string): boolean {
    return manuallyClosed.value.has(slot)
  }

  function expandSlot(slot: string, tabId?: string): void {
    slotExpanded.value = { ...slotExpanded.value, [slot]: true }
    // tabId usage is available for consumers who need show-tab semantics
    void tabId
  }

  function collapseSlot(slot: string): void {
    slotExpanded.value = { ...slotExpanded.value, [slot]: false }
  }

  function updateBadge(slot: string, count: number): void {
    slotBadges.value = { ...slotBadges.value, [slot]: count }
  }

  const ctx: LayoutPolicyContext = {
    userManuallyClosed,
    expandSlot,
    collapseSlot,
    updateBadge,
  }

  function applyEffect(effect: LayoutEffect): void {
    const { slot, action, tabId, badgeCount } = effect
    switch (action) {
      case 'expand':
        if (!userManuallyClosed(slot)) {
          expandSlot(slot, tabId)
        } else {
          // Don't-Disturb: badge instead of expanding
          updateBadge(slot, (slotBadges.value[slot] ?? 0) + 1)
        }
        break
      case 'collapse':
        collapseSlot(slot)
        break
      case 'badge':
        updateBadge(slot, badgeCount ?? (slotBadges.value[slot] ?? 0) + 1)
        break
      case 'show-tab':
        if (!userManuallyClosed(slot)) {
          expandSlot(slot, tabId)
        }
        break
    }
  }

  function processEvent(eventName: string, payload?: unknown): void {
    const handler = config.effects[eventName]
    if (!handler) return
    const effect = handler(ctx, payload)
    if (effect) applyEffect(effect)
  }

  function manualClose(slot: string): void {
    manuallyClosed.value.add(slot)
    collapseSlot(slot)
    // Clear badge when user actively closes
    updateBadge(slot, 0)
  }

  function manualOpen(slot: string): void {
    manuallyClosed.value.delete(slot)
    expandSlot(slot)
  }

  function resetSlotExpanded(slot: string): void {
    // Remove explicit expanded/collapsed override, letting initialState take effect again.
    const next = { ...slotExpanded.value }
    delete next[slot]
    slotExpanded.value = next
    // Also clear the manuallyClosed flag so auto-expand from artifacts works in the new session.
    manuallyClosed.value.delete(slot)
  }

  return { slotExpanded, slotBadges, processEvent, manualClose, manualOpen, resetSlotExpanded }
}
