<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { SidebarInset, SidebarProvider } from "@ce/components/ui/sidebar";
import NavigationSidebar from "@ce/components/NavigationSidebar.vue";
import MobilePortalTrigger from "@ce/components/MobilePortalTrigger.vue";

const route = useRoute();
const containedScroll = computed(() => route.meta.scrollMode === "contained");

// The draggable mobile portal-nav trigger now lives in the shared
// @ce/components/MobilePortalTrigger (SSOT — same affordance both 8087 and pro
// consume). No props here: it defaults to toggling this layout's Sidebar Sheet.
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
    <MobilePortalTrigger />
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

/* The draggable .mobile-portal-trigger CSS now lives (once) in the shared
   @ce/components/MobilePortalTrigger.vue — SSOT, no duplication here. */
</style>
