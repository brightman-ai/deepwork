import type { Component } from "vue";
import {
  BookOpen,
  BrainCircuit,
  FolderKanban,
  MessageSquare,
  TerminalSquare,
  Bot,
  Users,
  Settings,
  ClipboardList,
  Globe,
  Palette,
} from "lucide-vue-next";
import { isPortalEnabled } from "@ce/framework/portal";

export type PortalName =
  | "topic"
  | "chat"
  | "workspace"
  | "claw"
  | "knowledge"
  | "cli"
  | "council"
  | "planner"
  | "browser"
  | "open-design";

export interface PortalNavItem {
  name: string;
  label: string;
  path: string;
  portal: PortalName | null;
  icon: Component;
  description: string;
  external?: boolean;
}

export const portalNavItems: PortalNavItem[] = [
  {
    name: "topic",
    label: "Topic",
    path: "/portal/topic",
    portal: "topic",
    icon: BookOpen,
    description: "Topic Workbench",
  },
  {
    name: "chat",
    label: "Chat",
    path: "/portal/chat",
    portal: "chat",
    icon: MessageSquare,
    description: "Light chat sessions",
  },
  {
    name: "workspace",
    label: "Workspace",
    path: "/portal/workspace",
    portal: "workspace",
    icon: FolderKanban,
    description: "Project workbench",
  },
  {
    name: "claw",
    label: "Claw",
    path: "/portal/claw",
    portal: "claw",
    icon: Bot,
    description: "Expert home",
  },
  {
    name: "knowledge",
    label: "Knowledge",
    path: "/knowledge",
    portal: "knowledge",
    icon: BrainCircuit,
    description: "Human knowledge tree",
  },
  {
    name: "planner",
    label: "Requirement",
    path: "/planner",
    portal: "planner",
    icon: ClipboardList,
    description: "Requirement workbench",
  },
  {
    name: "browser",
    label: "Browser",
    path: "/portal/browser",
    portal: "browser",
    icon: Globe,
    description: "Browser companion",
  },
  {
    name: "cli",
    label: "CLI",
    path: "/portal/cli",
    portal: "cli",
    icon: TerminalSquare,
    description: "Terminal sessions",
  },
  {
    name: "council",
    label: "Council",
    path: "/portal/council/new",
    portal: "council",
    icon: Users,
    description: "Multi-AI Council",
  },
  {
    name: "open-design",
    label: "Open Design",
    path: "/portal/od",
    portal: "open-design",
    icon: Palette,
    description: "AI 设计工作台",
  },
];

export const utilityNavItems: PortalNavItem[] = [
  {
    name: "settings",
    label: "Settings",
    path: "/settings",
    portal: null,
    icon: Settings,
    description: "Provider and runtime settings",
  },
];

/**
 * Portal nav items filtered by current build edition.
 * Use this instead of portalNavItems directly for navigation rendering.
 *
 * Portal name → registry id mapping:
 *   "open-design" → "od"  (portal registry uses short id)
 *   all others: name === id
 */
const PORTAL_NAV_ID_MAP: Record<string, string> = {
  "open-design": "od",
}

export const enabledPortalNavItems: PortalNavItem[] = portalNavItems.filter((item) => {
  if (item.portal === null) return true
  const registryId = PORTAL_NAV_ID_MAP[item.name] ?? item.name
  return isPortalEnabled(registryId)
})

export function pageTitleForRoute(path: string): string {
  if (path.startsWith("/portal/topic") || path === "/" || path.startsWith("/categories")) {
    return "Topic Workbench";
  }
  if (path.startsWith("/t/")) {
    return "Topic";
  }
  if (path.startsWith("/portal/chat") || path.startsWith("/chat")) {
    return "Chat";
  }
  if (path.startsWith("/companion")) {
    return "英语助手";
  }
  if (path.startsWith("/portal/workspace") || path.startsWith("/ws")) {
    return "Workspace";
  }
  if (path.startsWith("/portal/claw") || path.startsWith("/claws")) {
    return "Claw Home";
  }
  if (path.startsWith("/knowledge")) {
    return "Knowledge Home";
  }
  if (path.startsWith("/portal/cli") || path.startsWith("/cli")) {
    return "CLI";
  }
  if (path.startsWith("/planner")) {
    return "Requirement";
  }
  if (path.startsWith("/portal/browser") || path.startsWith("/browser-sidebar")) {
    return "Browser";
  }
  if (path.startsWith("/portal/settings") || path.startsWith("/settings")) {
    return "Settings";
  }
  if (path.startsWith("/portal/council") || path.startsWith("/council")) {
    return "Council";
  }
  if (path.startsWith("/portal/od") || path.startsWith("/open-design")) {
    return "Open Design";
  }
  return "Deepwork";
}

export function isPortalRouteActive(currentPath: string, item: PortalNavItem): boolean {
  // "/" is the v6 home dashboard (CHG-014 V2). It is owned by the rail logo tile,
  // not any portal item, so no portal rail item is active on home. (Previously
  // "/" was the topic workbench, hence the legacy topic == "/" check, now gone.)
  if (item.name === "topic") {
    return currentPath.startsWith("/portal/topic") || currentPath.startsWith("/categories") || currentPath.startsWith("/t/");
  }
  if (item.name === "workspace") {
    return currentPath.startsWith("/portal/workspace") || currentPath.startsWith("/ws");
  }
  if (item.name === "companion") {
    return currentPath.startsWith("/companion");
  }
  if (item.name === "claw") {
    return currentPath.startsWith("/portal/claw") || currentPath.startsWith("/claws");
  }
  if (item.name === "council") {
    return currentPath.startsWith("/portal/council") || currentPath.startsWith("/council");
  }
  if (item.name === "planner") {
    return currentPath.startsWith("/planner");
  }
  if (item.name === "browser") {
    return currentPath.startsWith("/portal/browser") || currentPath.startsWith("/browser-sidebar");
  }
  if (item.name === "settings") {
    return currentPath.startsWith("/settings");
  }
  if (item.name === "open-design") {
    return currentPath.startsWith("/portal/od") || currentPath.startsWith("/open-design");
  }
  if (item.name === "cli") {
    return currentPath.startsWith("/portal/cli") || currentPath.startsWith("/cli");
  }
  if (item.name === "chat") {
    return currentPath.startsWith("/portal/chat") || currentPath.startsWith("/chat");
  }
  return currentPath === item.path || currentPath.startsWith(`${item.path}/`);
}
