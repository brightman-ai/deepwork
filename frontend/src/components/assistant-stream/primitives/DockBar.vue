<script setup lang="ts">
// CHG-014 D/J2.6: dock 终端 Dock (原型 1263-1279)。
// dock-h 折叠条 (▴ + dock-tab sd 状态标签) + 展开 body 槽 (xterm 区由装配方填)。
// 无会话时装配方不渲染本组件 (tabs 空数组也仍可渲染空壳)。
import { ref } from 'vue'
import StatusDot from './StatusDot.vue'

export interface DockTab {
  id: string
  label: string
  state: 'busy' | 'idle' | 'wait' | 'dead'
  unread?: boolean
}

withDefaults(defineProps<{
  tabs: DockTab[]
  hint?: string
}>(), { tabs: () => [], hint: 'xterm.js · 拖文件注入路径上下文' })

const open = ref(false)
</script>

<template>
  <div class="v6-dock" :class="{ 'v6-dock--open': open }" data-testid="v6-dock">
    <div class="v6-dock-h" role="button" tabindex="0" @click="open = !open" @keydown.enter="open = !open">
      <span>{{ open ? '▾' : '▴' }} 终端 Dock</span>
      <span v-for="tab in tabs" :key="tab.id" class="v6-dock-tab">
        <StatusDot :state="tab.state" />{{ tab.label }}
        <span v-if="tab.unread" class="v6-dock-tab__badge">未读</span>
      </span>
      <span class="v6-dock__grow" />
      <span class="v6-dock__hint">{{ hint }}</span>
    </div>
    <div v-if="open" class="v6-dock-body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.v6-dock {
  border-top: 1px solid var(--dw-bd);
  background: var(--dw-sf);
  flex-shrink: 0;
}
.v6-dock-h {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 30px;
  padding: 0 12px;
  cursor: pointer;
  font-family: var(--dw-mono);
  font-size: 10px;
  color: var(--dw-mu);
}
.v6-dock-h:hover { color: var(--dw-fg); }
.v6-dock-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 9px;
  border-radius: var(--dw-r);
  background: var(--dw-sf2);
  border: 1px solid var(--dw-bd);
  font-size: 10px;
}
.v6-dock-tab__badge {
  font-size: 8px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--dw-sf3);
  color: var(--dw-mu);
}
.v6-dock__grow { flex: 1; }
.v6-dock__hint { flex-shrink: 0; }
.v6-dock-body {
  height: 130px;
  overflow-y: auto;
  padding: 8px 14px;
  font-family: var(--dw-mono);
  font-size: 11px;
  line-height: 1.7;
  background: var(--dw-bg);
  border-top: 1px solid var(--dw-bd);
}
</style>
