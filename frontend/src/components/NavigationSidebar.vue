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

// Optional, generic visibility contract. When provided, the resolved portal-name
// list (server visible_portals merged with runtime-required) is passed through
// this filter as the FINAL say on what the rail renders. Default (prop absent) =
// identity, so behavior is byte-for-byte identical to before. This lets an outer
// shell project a narrower view (e.g. a progressive-disclosure tier) without this
// component knowing anything about the business semantics of the filter.
const props = defineProps<{
  portalFilter?: (portals: string[]) => string[];
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

// Apply the optional visibility contract as the FINAL projection. When no filter
// is passed this is the identity (unchanged default). When a filter IS passed it
// has the last word — so a tier that hides browser/open-design wins over the
// runtime-required force-merge above (those are infra defaults, not a mandate the
// filter must honor).
function applyFilter(portals: string[]): string[] {
  return props.portalFilter ? props.portalFilter(portals) : portals;
}

onMounted(async () => {
  // Project the local fallback default through the filter too, so the rail is
  // already tier-correct on first paint and stays correct if the API is down.
  visiblePortals.value = applyFilter(visiblePortals.value);
  try {
    const response = await fetch(apiUrl("/api/config/portals"));
    if (!response.ok) return;
    const data = await response.json();
    if (Array.isArray(data.visible_portals) && data.visible_portals.length > 0) {
      visiblePortals.value = applyFilter(ensureRequiredPortals(data.visible_portals));
    }
  } catch {
    // Keep local (already filtered) default when API is not available.
  }
});

function handleNavigate() {
  emit("navigate");
  if (isMobile.value) {
    // Defer the Sheet close to AFTER this click's event dispatch. The nav items are
    // <router-link>s; closing the radix Sheet synchronously here tears the link out of the
    // DOM within the same click, which on iOS Safari swallows WebKit's default navigation —
    // the tap registers but the page never changes (a Chromium/headless build navigates fine,
    // so this only bites on a real device). setTimeout(0) lets the router-link navigate first,
    // then closes the drawer. Covers same-route taps too (where a route watcher wouldn't fire).
    setTimeout(() => setOpenMobile(false), 0);
  }
}
</script>

<template>
  <!-- Mobile: the rail lives inside a Sheet driven by the mobile-portal trigger. -->
  <Sheet v-if="isMobile" :open="openMobile" @update:open="setOpenMobile">
    <SheetContent side="left" class="w-auto border-0 bg-transparent p-0 [&>button]:hidden">
      <!-- Accessible dialog name for screen readers (radix/reka requires one). -->
      <SheetTitle class="sr-only">导航</SheetTitle>
      <nav class="dw-rail dw-rail--sheet" data-od-id="rail" data-testid="navigation-sidebar">
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

/* Mobile sheet variant: the rail is full-height but the bottom edge sits behind iOS Safari's
   home-indicator / bottom chrome, so a bottom-pinned Settings gear is occluded (the user "can't
   see Settings"). In the sheet, DON'T push Settings to the bottom — let it follow the portal
   icons directly so it is always visible — and pad the bottom past the safe-area for good measure. */
.dw-rail--sheet {
  height: 100%;
  padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  overflow-y: auto;
  scrollbar-width: none;
}
.dw-rail--sheet::-webkit-scrollbar { display: none; }
.dw-rail--sheet .dw-rail-gap { flex: 0 0 8px; }
</style>
