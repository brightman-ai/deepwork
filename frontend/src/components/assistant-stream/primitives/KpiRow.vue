<script setup lang="ts">
// CHG-014 D/J2: kpis 行 (原型 1119-1126)。自适应栅格卡片。
// 数据 ← D5② /api/fleet/kpis。无值显「—」。tone=good → 绿色数字。
export interface KpiItem {
  value: string | number     // 已格式化的展示值，缺则传 '—'
  label: string
  tone?: 'default' | 'good'
  delta?: string             // ↑ 增量 (绿)
}

withDefaults(defineProps<{ items: KpiItem[] }>(), { items: () => [] })
</script>

<template>
  <div class="v6-kpis" data-testid="v6-kpis">
    <div v-for="(kpi, i) in items" :key="i" class="v6-kpi">
      <b :style="kpi.tone === 'good' ? { color: 'var(--dw-ok)' } : undefined">
        {{ kpi.value }}<span v-if="kpi.delta" class="v6-kpi__up"> {{ kpi.delta }}</span>
      </b>
      <span>{{ kpi.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.v6-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}
.v6-kpi {
  border: 1px solid var(--dw-bd);
  border-radius: var(--dw-r2);
  background: var(--dw-sf);
  padding: 9px 11px;
}
.v6-kpi b {
  font-family: var(--dw-mono);
  font-size: 15px;
  font-weight: 600;
  display: block;
}
.v6-kpi span { font-size: 10px; color: var(--dw-mu); }
.v6-kpi__up { color: var(--dw-ok); font-size: 9px; }
</style>
