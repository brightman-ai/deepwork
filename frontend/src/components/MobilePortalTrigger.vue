<script setup lang="ts">
import { type ComponentPublicInstance } from "vue";
import { ViewVerticalIcon } from "@radix-icons/vue";
import { Button } from "@ce/components/ui/button";
import { useSidebar } from "@ce/components/ui/sidebar";
import { useEdgeDrag } from "@ce/composables/useEdgeDrag";

// MobilePortalTrigger — the SSOT mobile portal-nav affordance.
//
// A fixed left-edge, vertically-draggable trigger (≤768px) that opens the portal
// navigation. It is the ONE shared mobile nav entry across the whole stack:
//   - deepwork-terminal / @ce shell (8087): default action toggles the @ce
//     NavigationSidebar Sheet (useSidebar.toggleSidebar).
//   - deepwork-pro (8088): passes `onActivate` to open its own left drawer
//     (`.dw-panel-zone`) via a window event — the trigger affordance is shared,
//     the drawer surface stays portal-owned.
//
// It is built from the same primitives as the @ce ui SidebarTrigger (Button +
// ViewVerticalIcon) so the icon/a11y match, but owns a SINGLE click handler so the
// open action can be cleanly redirected (no double-toggle from a second listener).
//
// Drag behaviour (tap = open, drag = reposition + persist) lives in @ce/composables/
// useEdgeDrag — the single source of truth, also used by the terminal ResourceDrawer
// handle. No duplicated drag logic, no duplicated trigger markup.
const props = defineProps<{
  /**
   * Optional open action. When supplied a tap fires this — lets a host (pro) open
   * its own nav surface. When omitted the trigger toggles the @ce Sidebar Sheet
   * (the 8087 default).
   */
  onActivate?: () => void;
  /** localStorage key for the persisted vertical offset (per-host). */
  storageKey?: string;
}>();

const { toggleSidebar } = useSidebar();
const { el: triggerEl, style: triggerStyle, shouldSuppressClick } = useEdgeDrag({
  storageKey: props.storageKey ?? "dw.portalNav.top",
});

// Button is a component, so a plain ref yields its instance — resolve the root DOM
// node ($el) for the composable, which needs a real HTMLElement.
function setTriggerEl(elOrInstance: Element | ComponentPublicInstance | null) {
  const node =
    elOrInstance instanceof Element
      ? elOrInstance
      : ((elOrInstance?.$el as HTMLElement | undefined) ?? null);
  triggerEl.value = node instanceof HTMLElement ? node : null;
}

function onClick() {
  // useEdgeDrag also swallows the click after a drag via its own capture guard, but
  // guard here too so a drag never triggers the open action.
  if (shouldSuppressClick()) return;
  if (props.onActivate) props.onActivate();
  else toggleSidebar();
}
</script>

<template>
  <Button
    :ref="setTriggerEl"
    data-sidebar="trigger"
    variant="ghost"
    size="icon"
    class="mobile-portal-trigger h-7 w-7"
    aria-label="打开 Portal 导航"
    data-testid="mobile-portal-nav-trigger"
    :style="triggerStyle"
    @click="onClick"
  >
    <ViewVerticalIcon />
    <span class="sr-only">打开 Portal 导航</span>
  </Button>
</template>

<style scoped>
.mobile-portal-trigger {
  display: none;
}

@media (max-width: 768px) {
  .mobile-portal-trigger {
    position: fixed;
    left: calc(env(safe-area-inset-left, 0px) + 10px);
    top: calc(50% - 23px);
    z-index: 70;
    display: inline-flex;
    width: 44px;
    height: 46px;
    border: 1px solid hsl(var(--border));
    border-left-color: transparent;
    border-radius: 0 14px 14px 0;
    background: hsl(var(--background) / 0.94);
    color: hsl(var(--foreground));
    box-shadow: 0 10px 30px hsl(var(--foreground) / 0.12);
    backdrop-filter: blur(12px);
    /* Own the vertical drag (useEdgeDrag); don't let the page scroll-hijack the gesture. */
    touch-action: none;
  }
}
</style>
