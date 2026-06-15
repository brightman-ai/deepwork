<script setup lang="ts">
import { computed, onMounted, type ComponentPublicInstance } from "vue";
import { useRoute } from "vue-router";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@ce/components/ui/sidebar";
import NavigationSidebar from "@ce/components/NavigationSidebar.vue";
import { useEdgeDrag } from "@ce/composables/useEdgeDrag";

const route = useRoute();
const containedScroll = computed(() => route.meta.scrollMode === "contained");

// The mobile portal-nav trigger is a fixed left-edge affordance; make it vertically
// draggable (same behaviour as the terminal's ResourceDrawer handle) so it can be moved
// off whatever it covers. A short tap still toggles the sidebar; a drag repositions +
// persists. SSOT: reuses @ce/composables/useEdgeDrag (no duplicated drag logic).
const { el: triggerEl, style: triggerStyle } = useEdgeDrag({ storageKey: "dw.portalNav.top" });
// SidebarTrigger is a component, so a plain ref yields its instance — resolve the root
// DOM node ($el) for the composable, which needs a real HTMLElement.
function setTriggerEl(elOrInstance: Element | ComponentPublicInstance | null) {
  const node =
    elOrInstance instanceof Element
      ? elOrInstance
      : ((elOrInstance?.$el as HTMLElement | undefined) ?? null);
  triggerEl.value = node instanceof HTMLElement ? node : null;
}
onMounted(() => {
  const isDesktop = !!(window as any).__wails || !!(window as any).wails;
  if (isDesktop) {
    document.documentElement.classList.add('wails-desktop');
    document.documentElement.style.setProperty('--dw-titlebar-inset', '50px');
  }
});

function toggleWindowMaximise(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.closest("button,a,input,textarea,select,[role='button']")) return;
  if (
    !target?.closest(
      "[data-window-drag-region],.dw-titlebar-blend,[data-sidebar='header']",
    )
  )
    return;
  const w = window as any;
  try {
    if (w.wails?.Window?.ToggleMaximise) {
      w.wails.Window.ToggleMaximise();
      return;
    }
    if (w.wails?.Window?.ToggleMaximize) {
      w.wails.Window.ToggleMaximize();
    }
  } catch {
    // Web-only context
  }
}
</script>

<template>
  <SidebarProvider class="dw-app-viewport-frame min-h-0 overflow-hidden" data-testid="main-layout">
    <NavigationSidebar />
    <SidebarTrigger
      :ref="setTriggerEl"
      class="mobile-portal-trigger"
      aria-label="打开 Portal 导航"
      data-testid="mobile-portal-nav-trigger"
      :style="triggerStyle"
    />
    <SidebarInset class="main-layout__inset dw-app-viewport-frame min-h-0 overflow-hidden" @dblclick="toggleWindowMaximise">
      <main
        class="main-layout__content flex-1 min-h-0"
        data-portal-scroll-root
        :class="containedScroll ? 'overflow-hidden' : 'overflow-y-auto'"
      >
        <div
          class="main-layout__view"
          :class="containedScroll ? 'main-layout__view--contained' : 'main-layout__view--page'"
        >
          <router-view />
        </div>
      </main>
    </SidebarInset>
  </SidebarProvider>
</template>

<style scoped>
.main-layout__view--contained {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding-top: var(--dw-titlebar-inset, 0px);
}

/* Portal with dw-titlebar-blend handles its own inset — remove view padding */
.main-layout__view--contained:has(.dw-titlebar-blend) {
  padding-top: 0;
}

.main-layout__view--page {
  min-height: 100%;
  padding-top: var(--dw-titlebar-inset, 0px);
}

.main-layout__view--page:has(.dw-titlebar-blend) {
  padding-top: 0;
}

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
