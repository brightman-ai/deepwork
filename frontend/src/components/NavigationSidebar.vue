<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@ce/components/ui/sidebar";
import { isPortalRouteActive, enabledPortalNavItems, utilityNavItems } from "@ce/lib/portalNav";
import { apiUrl } from "@ce/utils/runtimeBase";
import SetupWizardIcon from "@ce/components/wizard/SetupWizardIcon.vue";

const emit = defineEmits<{
  (e: "navigate"): void;
}>();

const route = useRoute();
const { isMobile, setOpenMobile } = useSidebar();
const runtimeRequiredPortals: string[] = ["browser", "open-design"];
const visiblePortals = ref<string[]>(["topic", "chat", "workspace", "claw", "knowledge", "planner", "browser", "studio", "cli", "council", "open-design"]);

const visibleItems = computed(() =>
  enabledPortalNavItems
    .filter((item) => item.portal === null || visiblePortals.value.includes(item.portal))
    .concat(utilityNavItems),
);

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
  <Sidebar collapsible="icon" data-testid="navigation-sidebar">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <!-- Sidebar toggle — macOS 原生范式: toggle 在 sidebar 内部 -->
          <SidebarMenuButton tooltip="展开/收缩侧栏" as-child>
            <SidebarTrigger class="nav-sidebar-trigger" />
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" as-child>
            <router-link to="/">
              <div class="flex aspect-square size-8 items-center justify-center rounded-lg bg-foreground text-background font-bold text-[10px] tracking-wider">
                DW
              </div>
              <div class="grid flex-1 text-left text-sm leading-tight">
                <span class="truncate font-semibold">Deepwork</span>
                <span class="truncate text-xs text-muted-foreground">Portal</span>
              </div>
            </router-link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>

    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Portals</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem v-for="item in visibleItems" :key="item.name">
              <SidebarMenuButton
                as-child
                :is-active="isPortalRouteActive(route.path, item)"
                :tooltip="item.description"
                :data-testid="`nav-item-${item.name}`"
              >
                <component
                  :is="item.external ? 'a' : 'router-link'"
                  v-bind="item.external ? { href: item.path } : { to: item.path }"
                  @click="handleNavigate"
                >
                  <component :is="item.icon" />
                  <span>{{ item.label }}</span>
                </component>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>

    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <SetupWizardIcon />
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>

    <SidebarRail />
  </Sidebar>
</template>

<style scoped>
.nav-sidebar-trigger {
  width: 100%;
  height: 32px;
  color: var(--sidebar-foreground);
  border-radius: 6px;
}
.nav-sidebar-trigger:hover {
  background: hsl(var(--sidebar-accent));
}
</style>
