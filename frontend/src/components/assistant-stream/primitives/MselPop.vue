<script setup lang="ts">
// CHG-014 D3: msel 三列选择弹窗壳 (原型 963-977)。纯壳: 列 + 项 + 选中态。
// columns 驱动；选中走回调。装配方决定每列语义 (Provider/模型/力度…)。
export interface MselItem {
  value: string
  label: string
  hint?: string              // 副标题 (灰小字)
  // 不可用项: 视觉降权 + 仍可点。故意不是 disabled — 装配方常要在点击时把用户
  // 送去配置页/新建会话 (RuntimePicker 对未安装 runtime 就是这么做的), 硬禁用会
  // 让那条引导路径也一起消失, 用户只会得到一个点不动的死项。
  unavailable?: boolean
}
export interface MselColumn {
  heading: string
  items: MselItem[]
  selected?: string          // 当前选中 value
}

withDefaults(defineProps<{
  columns: MselColumn[]
  open?: boolean
}>(), { open: false })

const emit = defineEmits<{
  (e: 'pick', columnIndex: number, value: string): void
}>()
</script>

<template>
  <div class="v6-mselpop" :class="{ 'v6-mselpop--on': open }" data-testid="v6-msel-pop">
    <div v-for="(col, ci) in columns" :key="ci" class="v6-msel-col">
      <div class="v6-msel__heading">{{ col.heading }}</div>
      <div
        v-for="it in col.items"
        :key="it.value"
        class="v6-msel-it"
        :class="{ on: it.value === col.selected, 'v6-msel-it--off': it.unavailable }"
        role="button"
        tabindex="0"
        :aria-disabled="it.unavailable ? 'true' : undefined"
        @click="emit('pick', ci, it.value)"
        @keydown.enter="emit('pick', ci, it.value)"
      >
        {{ it.label }}
        <span v-if="it.hint">{{ it.hint }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.v6-mselpop {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  display: none;
  background: var(--dw-sf2);
  border: 1px solid var(--dw-bd);
  border-radius: var(--dw-r3);
  box-shadow: 0 14px 40px rgb(0 0 0 / 0.5);
  padding: 8px;
  z-index: 65;
  gap: 6px;
}
.v6-mselpop--on { display: flex; }
.v6-msel-col {
  min-width: 118px;
  border-right: 1px solid var(--dw-bd);
  padding-right: 6px;
}
.v6-msel-col:last-child { border: none; padding-right: 0; }
.v6-msel__heading {
  font-family: var(--dw-mono);
  font-size: 10px;
  text-transform: uppercase;
  color: var(--dw-mu);
  padding: 0 9px 4px;
}
.v6-msel-it {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 6px 9px;
  border-radius: var(--dw-r);
  cursor: pointer;
  font-size: 11.5px;
  color: var(--dw-mu);
}
.v6-msel-it:hover { background: var(--dw-sf3); color: var(--dw-fg); }
.v6-msel-it.on { background: var(--dw-ac-dim); color: var(--dw-ac); }
.v6-msel-it span { font-size: 9.5px; opacity: 0.75; }
/* 不可用项: 与 RuntimePicker 的 .rtpick__row--off / SettingsSupplyMatrix 的 .sm__rt--off
   同一视觉语言 (降透明度), 让「点了能用」和「点了会把你送去配置」一眼可分。仍可点 —
   点击语义由装配方决定 (通常是引导去配置/新建会话)。 */
.v6-msel-it--off { opacity: 0.5; }
.v6-msel-it--off:hover { opacity: 0.72; }
</style>
