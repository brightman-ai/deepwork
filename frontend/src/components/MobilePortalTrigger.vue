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
  /* explore-r1 F3 (Human-authorized, 体验要优异): was a 44px opaque button floating at
     mid-left over content (covered KPI labels / token rows / code — Witness-confirmed). Now
     a SLIM edge pull-tab flush to the screen edge: covers only a sliver, translucent at rest,
     blooms wider+opaque on touch. Keeps the shared draggable-edge nav affordance, stops the
     content occlusion. */
  .mobile-portal-trigger {
    position: fixed;
    left: 0;
    top: calc(50% - 26px);
    z-index: 70;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 15px;
    min-width: 15px;
    height: 52px;
    padding: 0;
    border: 1px solid hsl(var(--border));
    border-left: none;
    border-radius: 0 10px 10px 0;
    background: hsl(var(--background) / 0.55);
    color: hsl(var(--muted-foreground));
    box-shadow: 0 4px 14px hsl(var(--foreground) / 0.08);
    backdrop-filter: blur(8px);
    opacity: 0.7;
    transition: opacity 0.15s, width 0.15s, background 0.15s;
    /* Own the vertical drag (useEdgeDrag); don't let the page scroll-hijack the gesture. */
    touch-action: none;
  }
  .mobile-portal-trigger:hover,
  .mobile-portal-trigger:active,
  .mobile-portal-trigger:focus-visible {
    opacity: 1;
    width: 22px;
    background: hsl(var(--background) / 0.96);
    color: hsl(var(--foreground));
  }
  .mobile-portal-trigger :deep(svg) {
    width: 11px;
    height: 11px;
  }
}
</style>
