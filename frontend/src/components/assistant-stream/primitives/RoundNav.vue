<script setup lang="ts">
// CHG-014 D2/C: RoundNav 轮次导航 — 一组件两密度 (原型 985-989 hover / 915-919 persistent)。
//
// density='hover'      → 右缘刻度 (rn/i) + hover 浮窗 (rndchip + 摘要 rpt + rpm 指标)。
//                        WS/OD/Chat 用。点击 tick → emit('goto', index) 由装配方滚动定位。
// density='persistent' → tline 时间线: 起止标签 + 拖拽手柄 + #cur/total + 回到上次位置。
//                        Topic 用。拖拽手柄 emit('seek', ratio)；back emit('goto', lastReadIndex)。
//
// 滚动联动: 装配方监听滚动后更新 rounds[].current / meta.current → 本组件被动渲染。
import { computed, onUnmounted, ref } from 'vue'
import type { AssistantRoundItem, AssistantTimelineMeta } from '../types'

const props = withDefaults(defineProps<{
  density?: 'hover' | 'persistent'
  rounds?: AssistantRoundItem[]
  meta?: AssistantTimelineMeta | null   // persistent 密度必填
}>(), {
  density: 'hover',
  rounds: () => [],
  meta: null,
})

const emit = defineEmits<{
  (e: 'goto', index: number): void
  (e: 'seek', ratio: number): void      // persistent 拖拽 0-1
}>()

function fmtTok(n?: number): string {
  if (n === undefined || n < 0) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

// persistent 手柄位置 (%)
const handleTop = computed(() => {
  const m = props.meta
  if (!m || m.total <= 1) return 0
  return ((m.current - 1) / (m.total - 1)) * 100
})

// CHG-014 S8 F6: pointer-events 拖拽。原实现只在 3px 轨道内监听 mousemove/mouseup，
// 鼠标一离开轨道即断拖，且无触摸支持。现用 pointer events + setPointerCapture：
// 指针在手柄上按下后被「捕获」，move/up 事件继续投递到手柄（无视后续位置），
// 因而拖出轨道也不断；pointer 事件统一覆盖鼠标/触摸/笔。onUnmounted 兜底清理。
const scrollRef = ref<HTMLElement | null>(null)
const handleRef = ref<HTMLElement | null>(null)
const dragging = ref(false)

function ratioFromY(clientY: number): number {
  if (!scrollRef.value) return 0
  const rect = scrollRef.value.getBoundingClientRect()
  if (rect.height === 0) return 0
  return Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
}

function onPointerDown(ev: PointerEvent): void {
  dragging.value = true
  handleRef.value?.setPointerCapture(ev.pointerId)
  emit('seek', ratioFromY(ev.clientY))
  ev.preventDefault()
}
function onPointerMove(ev: PointerEvent): void {
  if (!dragging.value) return
  emit('seek', ratioFromY(ev.clientY))
}
function onPointerUp(ev: PointerEvent): void {
  if (!dragging.value) return
  dragging.value = false
  if (handleRef.value?.hasPointerCapture(ev.pointerId)) {
    handleRef.value.releasePointerCapture(ev.pointerId)
  }
}

// F6 键盘：手柄聚焦后用 ↑/↓ 按轮步进 seek（无 total 时不响应）。
function onHandleKey(ev: KeyboardEvent): void {
  const m = props.meta
  if (!m || m.total <= 1) return
  let next = m.current
  if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') next = Math.max(1, m.current - 1)
  else if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight') next = Math.min(m.total, m.current + 1)
  else if (ev.key === 'Home') next = 1
  else if (ev.key === 'End') next = m.total
  else return
  ev.preventDefault()
  emit('seek', (next - 1) / (m.total - 1))
}

onUnmounted(() => { dragging.value = false })
</script>

<template>
  <!-- hover 密度: 右缘刻度 + 浮窗。F7: 原生 button → 自带键盘 (Enter/Space) + focus；
       aria-label 暴露轮摘要给读屏；浮窗 :focus-within 也展开 (键盘 focus 可见摘要)。 -->
  <div v-if="density === 'hover'" class="v6-rnav" data-testid="v6-roundnav-hover">
    <button
      v-for="r in rounds"
      :key="r.index"
      type="button"
      class="v6-rn"
      :class="{ cur: r.current }"
      :aria-label="`第 ${r.index} 轮: ${r.title}`"
      :aria-current="r.current ? 'true' : undefined"
      @click="emit('goto', r.index)"
    >
      <i />
      <span class="v6-rp">
        <span class="v6-rpn">
          <span class="v6-rndchip">#{{ r.index }}</span>
          <span class="v6-rpt">{{ r.title }}</span>
        </span>
        <span class="v6-rpm">
          {{ r.engine ? r.engine + ' · ' : '' }}↓{{ fmtTok(r.inTokens) }} ↑{{ fmtTok(r.outTokens) }}{{ r.duration ? ' · ' + r.duration : '' }}
        </span>
      </span>
    </button>
  </div>

  <!-- persistent 密度: tline 时间线 -->
  <div v-else class="v6-tline" data-testid="v6-roundnav-persistent">
    <span v-if="meta?.startLabel" class="v6-td">{{ meta.startLabel }}</span>
    <div ref="scrollRef" class="v6-tline-scroll">
      <!-- 每轮刻度: F7 原生 button + aria-label。
           CHG-014 R2(topic): 高体验 hover 密度 — hover/focus 显楼层#+作者+摘要浮窗 (v6-tkp)；
           visited (已读楼层) 刻度灰化。 -->
      <button
        v-for="r in rounds"
        :key="r.index"
        type="button"
        class="v6-tk2"
        :class="{ cur: r.current, visited: r.visited && !r.current }"
        :style="{ top: meta && meta.total > 1 ? ((r.index - 1) / (meta.total - 1) * 100) + '%' : '0%' }"
        :aria-label="`跳到第 ${r.index} 轮: ${r.title}`"
        :aria-current="r.current ? 'true' : undefined"
        @click="emit('goto', r.index)"
      >
        <span class="v6-tkp">
          <span class="v6-rndchip">#{{ r.index }}</span>
          <span class="v6-tkp-t">{{ r.title }}</span>
        </span>
      </button>
      <!-- F6 拖拽手柄: pointer-capture + role=slider + 键盘步进。 -->
      <div
        ref="handleRef"
        class="v6-tline-hd"
        :class="{ dragging }"
        :style="{ top: handleTop + '%' }"
        role="slider"
        tabindex="0"
        aria-label="时间线位置"
        :aria-valuemin="1"
        :aria-valuemax="meta?.total ?? 1"
        :aria-valuenow="meta?.current ?? 1"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @keydown="onHandleKey"
      />
      <div class="v6-tline-pos" :style="{ top: handleTop + '%' }">
        <b>{{ meta?.current ?? 1 }}</b> / {{ meta?.total ?? 1 }}
      </div>
    </div>
    <span v-if="meta?.endLabel" class="v6-td">{{ meta.endLabel }}</span>
    <button
      v-if="meta?.lastReadIndex !== undefined"
      type="button"
      class="v6-tline-back"
      @click="emit('goto', meta!.lastReadIndex!)"
    >↓ 回到上次读到的位置</button>
  </div>
</template>

<style scoped>
/* ── hover 密度 ── */
.v6-rnav {
  position: absolute;
  right: 5px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  z-index: 22;
}
.v6-rn {
  position: relative;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 4px 3px;
  cursor: pointer;
  border: 0;
  background: transparent;
  font: inherit;
  color: inherit;
}
.v6-rn:focus-visible {
  outline: 2px solid var(--dw-ac);
  outline-offset: 2px;
  border-radius: 3px;
}
.v6-rn i {
  width: 11px;
  height: 2.5px;
  border-radius: 2px;
  background: var(--dw-mu);
  opacity: 0.35;
  transition: width 0.12s, opacity 0.12s;
}
.v6-rn:hover i { opacity: 0.95; width: 15px; }
.v6-rn.cur i { background: var(--dw-ac); opacity: 1; width: 17px; height: 3px; }
.v6-rp {
  position: absolute;
  right: 22px;
  top: 50%;
  transform: translateY(-50%);
  width: 240px;
  background: var(--dw-sf2);
  border: 1px solid var(--dw-bd);
  border-radius: var(--dw-r2);
  padding: 8px 11px;
  box-shadow: var(--dw-shadow-pop);
  display: none;
  z-index: 55;
  text-align: left;
}
.v6-rn:hover .v6-rp,
.v6-rn:focus-visible .v6-rp { display: block; }
.v6-rpn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.v6-rpt {
  flex: 1;
  margin: 0;
  font-size: 11.5px;
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dw-fg);
}
.v6-rpm {
  display: block;
  font-family: var(--dw-mono);
  font-size: 9.5px;
  color: var(--dw-mu);
  margin-top: 3px;
}
.v6-rndchip {
  display: inline-flex;
  align-items: center;
  padding: 0 6px;
  height: 15px;
  border-radius: 8px;
  background: var(--dw-sf2);
  border: 1px solid var(--dw-bd);
  font-family: var(--dw-mono);
  font-size: 9px;
  color: var(--dw-mu);
  flex-shrink: 0;
}

/* ── persistent 密度 (tline) ── */
.v6-tline {
  width: 108px;
  min-width: 108px;
  padding: 26px 14px;
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
}
.v6-td {
  font-family: var(--dw-mono);
  font-size: 10px;
  color: var(--dw-mu);
  padding: 2px 0;
}
.v6-tline-scroll {
  position: relative;
  width: 3px;
  background: var(--dw-bd);
  border-radius: 2px;
  flex: 1;
  min-height: 120px;
  margin: 8px 0 8px 5px;
}
.v6-tline-hd {
  position: absolute;
  left: -5px;
  width: 13px;
  height: 34px;
  background: var(--dw-sf3);
  border: 1px solid var(--dw-mu);
  border-radius: 7px;
  cursor: grab;
  transform: translateY(-50%);
  touch-action: none;  /* F6: 让 pointer 拖拽吃掉触摸手势，不滚页面 */
}
.v6-tline-hd.dragging { cursor: grabbing; }
.v6-tline-hd:focus-visible {
  outline: 2px solid var(--dw-ac);
  outline-offset: 1px;
}
.v6-tline-pos {
  position: absolute;
  left: 18px;
  font-family: var(--dw-mono);
  font-size: 11px;
  white-space: nowrap;
  transform: translateY(-50%);
  color: var(--dw-fg);
}
.v6-tline-pos b { color: var(--dw-ac); }
.v6-tline-back {
  margin-top: 10px;
  font-size: 10.5px;
  color: var(--dw-blu);
  cursor: pointer;
  border: 0;
  background: transparent;
  font: inherit;
  text-align: left;
  padding: 0;
}
.v6-tline-back:focus-visible {
  outline: 2px solid var(--dw-blu);
  outline-offset: 2px;
}
.v6-tk2 {
  position: absolute;
  left: -3px;
  width: 9px;
  height: 2px;
  border-radius: 1px;
  background: var(--dw-mu);
  opacity: 0.38;
  cursor: pointer;
  transform: translateY(-50%);
  padding: 0;
}
.v6-tk2:hover { opacity: 1; background: var(--dw-fg); }
.v6-tk2:focus-visible {
  opacity: 1;
  outline: 2px solid var(--dw-ac);
  outline-offset: 2px;
}
.v6-tk2.cur { background: var(--dw-ac); opacity: 1; width: 13px; height: 3px; left: -5px; }
/* R2(topic): 已读楼层灰化 — 比 unvisited 更暗/更透, 与 cur 琥珀对比清晰。 */
.v6-tk2.visited { opacity: 0.18; background: var(--dw-mu); }
.v6-tk2.visited:hover { opacity: 0.6; }

/* R2(topic): tline 刻度 hover/focus 浮窗 — 楼层 #N + 作者·摘要 (rounds[].title)。
   hover 密度的 v6-rp 是垂直居中右浮; tline 刻度极矮, 浮窗以刻度为锚右侧居中。 */
.v6-tkp {
  position: absolute;
  right: calc(100% + 12px);
  top: 50%;
  transform: translateY(-50%);
  width: 230px;
  display: none;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  background: var(--dw-sf2);
  border: 1px solid var(--dw-bd);
  border-radius: var(--dw-r2);
  box-shadow: var(--dw-shadow-pop);
  z-index: 56;
  text-align: left;
  pointer-events: none;
}
.v6-tk2:hover .v6-tkp,
.v6-tk2:focus-visible .v6-tkp { display: inline-flex; }
.v6-tkp-t {
  flex: 1;
  min-width: 0;
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--dw-fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
