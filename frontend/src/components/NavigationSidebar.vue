<script setup lang="ts">
// v6 icon rail (CHG-014 V1) — 56px icon-only navigation rail.
//
// Visual contract (deepwork-v6.html .rail): amber logo tile pinned top, one
// icon button per portal with a right-side hover tooltip, active portal painted
// with --dw-ac-dim background + --dw-ac icon. Settings is pinned to the bottom
// via a flex gap. The portal set still comes from /api/config/portals — the API
// contract is unchanged; only the chrome differs from the old text sidebar.
//
// Responsive: on desktop the rail is a permanent 56px column (never expands).
// On mobile it collapses into a Sheet driven by the existing mobile-portal
// trigger (MainLayout) via useSidebar's openMobile state. Wails titlebar inset
// is honored via the --dw-titlebar-inset padding on the rail top.
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { Sheet, SheetContent, SheetTitle } from "@ce/components/ui/sheet";
import { useSidebar } from "@ce/components/ui/sidebar";
import { isPortalRouteActive, enabledPortalNavItems, utilityNavItems } from "@ce/lib/portalNav";
import { apiUrl } from "@ce/utils/runtimeBase";

const emit = defineEmits<{
  (e: "navigate"): void;
}>();

const route = useRoute();
const { isMobile, openMobile, setOpenMobile } = useSidebar();
const runtimeRequiredPortals: string[] = ["browser", "open-design"];
const visiblePortals = ref<string[]>([
  "topic", "chat", "workspace", "claw", "knowledge", "planner", "browser", "cli", "council", "open-design",
]);

// v6 rail order (deepwork-v6.html): home → topic → chat → workspace →
// open-design → browser → cli → claw → knowledge → requirement → council.
// `home` resolves to "/" which the topic item already owns as active route, so
// the dedicated home tile is the logo. Settings is pinned at the bottom.
const RAIL_ORDER = [
  "topic", "chat", "workspace", "open-design", "browser", "cli", "claw", "knowledge", "planner", "council",
];

const portalItems = computed(() => {
  const enabled = enabledPortalNavItems.filter(
    (item) => item.portal === null || visiblePortals.value.includes(item.portal),
  );
  const byName = new Map(enabled.map((item) => [item.name, item]));
  const ordered = RAIL_ORDER.map((name) => byName.get(name)).filter(
    (item): item is NonNullable<typeof item> => Boolean(item),
  );
  // Any enabled portal not listed in RAIL_ORDER is appended so a new portal is
  // never silently dropped from the rail.
  for (const item of enabled) {
    if (!RAIL_ORDER.includes(item.name)) ordered.push(item);
  }
  return ordered;
});

const settingsItem = computed(() => utilityNavItems.find((item) => item.name === "settings"));

function ensureRequiredPortals(portals: string[]): string[] {
  const merged = [...portals];
  for (const portal of runtimeRequiredPortals) {
    if (!merged.includes(portal)) {
      merged.push(portal);
    }
  }
  return merged;
}

onMounted(async () => {
  try {
    const response = await fetch(apiUrl("/api/config/portals"));
    if (!response.ok) return;
    const data = await response.json();
    if (Array.isArray(data.visible_portals) && data.visible_portals.length > 0) {
      visiblePortals.value = ensureRequiredPortals(data.visible_portals);
    }
  } catch {
    // Keep local default when API is not available.
  }
});

function handleNavigate() {
  emit("navigate");
  if (isMobile.value) {
    setOpenMobile(false);
  }
}
</script>

<template>
  <!-- Mobile: the rail lives inside a Sheet driven by the mobile-portal trigger. -->
  <Sheet v-if="isMobile" :open="openMobile" @update:open="setOpenMobile">
    <SheetContent side="left" class="w-auto border-0 bg-transparent p-0 [&>button]:hidden">
      <!-- Accessible dialog name for screen readers (radix/reka requires one). -->
      <SheetTitle class="sr-only">导航</SheetTitle>
      <nav class="dw-rail" data-od-id="rail" data-testid="navigation-sidebar">
        <router-link
          to="/"
          class="dw-rail-logo"
          aria-label="主页"
          data-testid="nav-item-home"
          @click="handleNavigate"
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor" aria-hidden="true">
            <rect x="1" y="4" width="4" height="7" rx=".5" />
            <rect x="5.5" y="2" width="4" height="11" rx=".5" />
            <rect x="10" y="5" width="4" height="6" rx=".5" />
          </svg>
        </router-link>
        <component
          :is="item.external ? 'a' : 'router-link'"
          v-for="item in portalItems"
          :key="item.name"
          v-bind="item.external ? { href: item.path } : { to: item.path }"
          class="dw-rb"
          :class="{ on: isPortalRouteActive(route.path, item) }"
          :data-tip="item.label"
          :data-testid="`nav-item-${item.name}`"
          :aria-label="item.label"
          @click="handleNavigate"
        >
          <component :is="item.icon" />
        </component>
        <div class="dw-rail-gap" />
        <router-link
          v-if="settingsItem"
          :to="settingsItem.path"
          class="dw-rb"
          :class="{ on: isPortalRouteActive(route.path, settingsItem) }"
          :data-tip="settingsItem.label"
          :data-testid="`nav-item-${settingsItem.name}`"
          :aria-label="settingsItem.label"
          @click="handleNavigate"
        >
          <component :is="settingsItem.icon" />
        </router-link>
      </nav>
    </SheetContent>
  </Sheet>

  <!-- Desktop: permanent 56px icon rail. -->
  <nav v-else class="dw-rail" data-od-id="rail" data-testid="navigation-sidebar">
    <!-- Amber logo tile → home ("/") -->
    <router-link
      to="/"
      class="dw-rail-logo"
      aria-label="主页"
      data-testid="nav-item-home"
      @click="handleNavigate"
    >
      <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor" aria-hidden="true">
        <rect x="1" y="4" width="4" height="7" rx=".5" />
        <rect x="5.5" y="2" width="4" height="11" rx=".5" />
        <rect x="10" y="5" width="4" height="6" rx=".5" />
      </svg>
    </router-link>

    <component
      :is="item.external ? 'a' : 'router-link'"
      v-for="item in portalItems"
      :key="item.name"
      v-bind="item.external ? { href: item.path } : { to: item.path }"
      class="dw-rb"
      :class="{ on: isPortalRouteActive(route.path, item) }"
      :data-tip="item.label"
      :data-testid="`nav-item-${item.name}`"
      :aria-label="item.label"
      @click="handleNavigate"
    >
      <component :is="item.icon" />
    </component>

    <div class="dw-rail-gap" />

    <router-link
      v-if="settingsItem"
      :to="settingsItem.path"
      class="dw-rb"
      :class="{ on: isPortalRouteActive(route.path, settingsItem) }"
      :data-tip="settingsItem.label"
      :data-testid="`nav-item-${settingsItem.name}`"
      :aria-label="settingsItem.label"
      @click="handleNavigate"
    >
      <component :is="settingsItem.icon" />
    </router-link>
  </nav>
</template>

<style scoped>
.dw-rail {
  width: 56px;
  min-width: 56px;
  height: 100%;
  background: var(--dw-sf);
  border-right: 1px solid var(--dw-bd);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: calc(10px + var(--dw-titlebar-inset, 0px)) 0 12px;
  gap: 2px;
  z-index: 30;
}

.dw-rail-logo {
  width: 30px;
  height: 30px;
  background: var(--dw-ac);
  border-radius: var(--dw-r2);
  display: grid;
  place-items: center;
  margin-bottom: 12px;
  color: var(--dw-on-accent);
  flex-shrink: 0;
}

.dw-rb {
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: var(--dw-r);
  display: grid;
  place-items: center;
  color: var(--dw-mu);
  flex-shrink: 0;
  transition: background 0.1s, color 0.1s;
}
.dw-rb:hover {
  background: var(--dw-sf2);
  color: var(--dw-fg);
}
.dw-rb.on {
  background: var(--dw-ac-dim);
  color: var(--dw-ac);
}
.dw-rb :deep(svg) {
  width: 17px;
  height: 17px;
}

/* right-side hover tooltip (v6 .rb::after) */
.dw-rb::after {
  content: attr(data-tip);
  position: absolute;
  left: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
  background: var(--dw-sf3);
  font-size: 11px;
  white-space: nowrap;
  padding: 4px 9px;
  border-radius: var(--dw-r);
  border: 1px solid var(--dw-bd);
  color: var(--dw-fg);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.1s;
  z-index: 99;
}
/* Show the label on hover AND on keyboard focus so sighted keyboard users
   tabbing the icon-only rail get the same affordance as mouse users. */
.dw-rb:hover::after,
.dw-rb:focus-visible::after {
  opacity: 1;
}

.dw-rail-gap {
  flex: 1;
}
</style>
