<script setup lang="ts">
/**
 * @ce SettingsPortal — the SINGLE settings shell for every host. It renders the 'settings' slot
 * via PortalSectionHost, so the content is the union of sections contributed by @ce + terminal +
 * pro. Both the standalone terminal and pro mount THIS component (their routers point here), which
 * is what eliminates the old per-repo settings divergence. It also loads the shared section chrome
 * (section-ui.css) once for all sections.
 */
import PortalSectionHost from '@ce/components/PortalSectionHost.vue'
import '@ce/portals/settings/sections/section-ui.css'
</script>

<template>
  <PortalSectionHost slot-id="settings" data-testid="settings-portal" />
</template>
