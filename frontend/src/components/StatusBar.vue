<script setup lang="ts">
// StatusBar (CHG-014 V1) — v6 top status bar chrome. ZERO business logic.
//
// Visual contract (deepwork-v6.html .topbar): a 44px bar on --dw-sf with a
// bottom border. Left holds the page title / context; right holds status items
// (agent count, model badge, …). All data is supplied by the host via slots —
// this component owns layout + chrome only, never a data source. Consumers in
// the product (pro MainLayout) compose real data into the slots.
</script>

<template>
  <header class="dw-statusbar" data-testid="status-bar">
    <div class="dw-statusbar__left">
      <slot name="left" />
    </div>
    <div class="dw-statusbar__spacer" />
    <div class="dw-statusbar__right">
      <slot name="right" />
    </div>
  </header>
</template>

<style scoped>
.dw-statusbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  height: 44px;
  min-height: 44px;
  border-bottom: 1px solid var(--dw-bd);
  background: var(--dw-sf);
  flex-shrink: 0;
}

.dw-statusbar__left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--dw-fg);
}

.dw-statusbar__spacer {
  flex: 1;
}

.dw-statusbar__right {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--dw-mono);
  font-size: 11px;
  color: var(--dw-mu);
}
</style>
