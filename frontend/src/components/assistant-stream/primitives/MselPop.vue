<script setup lang="ts">
// CHG-014 D3: msel 三列选择弹窗壳 (原型 963-977)。纯壳: 列 + 项 + 选中态。
// columns 驱动；选中走回调。装配方决定每列语义 (Provider/模型/力度…)。
export interface MselItem {
  value: string;
  label: string;
  hint?: string; // 副标题 (灰小字)
  // 不可用项: 视觉降权 + 仍可点。故意不是 disabled — 装配方常要在点击时把用户
  // 送去配置页/新建会话 (RuntimePicker 对未安装 runtime 就是这么做的), 硬禁用会
  // 让那条引导路径也一起消失, 用户只会得到一个点不动的死项。
  unavailable?: boolean;
}
export interface MselColumn {
  heading: string;
  items: MselItem[];
  selected?: string; // 当前选中 value
}

withDefaults(
  defineProps<{
    columns: MselColumn[];
    open?: boolean;
  }>(),
  { open: false },
);

const emit = defineEmits<{
  (e: "pick", columnIndex: number, value: string): void;
}>();

// Grid keyboard semantics (ARIA listbox/grid): ↑↓ move within a column (wrap),
// ←→ move across columns (same row, clamped), Home/End jump to column ends.
// Enter/Space activate natively (rows are <button>). Esc is the parent's job.
function onKeydown(ev: KeyboardEvent): void {
  const key = ev.key;
  if (
    key !== "ArrowDown" &&
    key !== "ArrowUp" &&
    key !== "ArrowLeft" &&
    key !== "ArrowRight" &&
    key !== "Home" &&
    key !== "End"
  )
    return;
  const root = ev.currentTarget as HTMLElement;
  const cols = Array.from(root.querySelectorAll<HTMLElement>(".v6-msel-col"));
  if (!cols.length) return;
  const itemsOf = (col: HTMLElement) =>
    Array.from(col.querySelectorAll<HTMLButtonElement>(".v6-msel-it"));
  ev.preventDefault();
  let ci = -1;
  let ii = -1;
  cols.forEach((col, x) => {
    const i = itemsOf(col).indexOf(document.activeElement as HTMLButtonElement);
    if (i >= 0) {
      ci = x;
      ii = i;
    }
  });
  if (ci < 0) {
    const last = key === "ArrowUp" || key === "ArrowLeft" || key === "End";
    const items = itemsOf(cols[last ? cols.length - 1 : 0]);
    (last ? items[items.length - 1] : items[0])?.focus();
    return;
  }
  const items = itemsOf(cols[ci]);
  if (key === "ArrowDown") items[(ii + 1) % items.length]?.focus();
  else if (key === "ArrowUp")
    items[(ii - 1 + items.length) % items.length]?.focus();
  else if (key === "Home") items[0]?.focus();
  else if (key === "End") items[items.length - 1]?.focus();
  else {
    const nc =
      key === "ArrowRight"
        ? (ci + 1) % cols.length
        : (ci - 1 + cols.length) % cols.length;
    const ni = itemsOf(cols[nc]);
    ni[Math.min(ii, ni.length - 1)]?.focus();
  }
}
</script>

<template>
  <div
    class="v6-mselpop"
    :class="{ 'v6-mselpop--on': open }"
    data-testid="v6-msel-pop"
    @keydown="onKeydown"
  >
    <div
      v-for="(col, ci) in columns"
      :key="ci"
      class="v6-msel-col"
      role="group"
      :aria-label="col.heading"
    >
      <div class="v6-msel__heading">{{ col.heading }}</div>
      <button
        v-for="it in col.items"
        :key="it.value"
        type="button"
        class="v6-msel-it"
        :class="{
          on: it.value === col.selected,
          'v6-msel-it--off': it.unavailable,
        }"
        :aria-label="it.hint ? `${it.label}，${it.hint}` : it.label"
        :aria-pressed="it.value === col.selected"
        @click="emit('pick', ci, it.value)"
      >
        {{ it.label }}
        <span v-if="it.hint">{{ it.hint }}</span>
      </button>
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
.v6-mselpop--on {
  display: flex;
}
.v6-msel-col {
  min-width: 118px;
  border-right: 1px solid var(--dw-bd);
  padding-right: 6px;
}
.v6-msel-col:last-child {
  border: none;
  padding-right: 0;
}
.v6-msel__heading {
  font-family: var(--dw-mono);
  font-size: 10px;
  text-transform: uppercase;
  color: var(--dw-fg-muted, #a1a1aa);
  padding: 0 9px 4px;
}
.v6-msel-it {
  font: inherit;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 6px 9px;
  border-radius: var(--dw-r);
  cursor: pointer;
  font-size: 11.5px;
  color: var(--dw-fg);
  border: 0;
  background: transparent;
  text-align: left;
}
.v6-msel-it:hover {
  background: var(--dw-sf3);
  color: var(--dw-fg);
}
.v6-msel-it:focus-visible {
  /* focus ≠ selected: the ring is neutral and sits OUTSIDE the row, so it reads
     on plain rows and on the accent-tinted selected row alike. */
  outline: 2px solid var(--dw-focus-ring, #f4f4f5);
  outline-offset: 1px;
}
.v6-msel-it.on {
  background: var(--dw-ac-dim);
  color: var(--dw-ac);
}
.v6-msel-it span {
  font-size: 10.5px;
  line-height: 1.35;
  color: var(--dw-fg-muted, #a1a1aa);
}
/* 不可用项: 与 RuntimePicker 的 .rtpick__row--off / SettingsSupplyMatrix 的 .sm__rt--off
   同一视觉语言 (降透明度), 让「点了能用」和「点了会把你送去配置」一眼可分。仍可点 —
   点击语义由装配方决定 (通常是引导去配置/新建会话)。 */
.v6-msel-it--off {
  box-shadow: inset 0 0 0 1px var(--dw-bd);
}
.v6-msel-it--off:hover {
  background: var(--dw-sf3);
}
</style>
