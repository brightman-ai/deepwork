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
import RoundAvatar from './RoundAvatar.vue'

// P4 (Gap-5): 每轮发起者头像/作者名 (AI/Human 区分)。装配方喂 r.role/r.author;
// 缺省时按 role 兜底显示, role 也缺则不渲染头像 (无死 UI, 向后兼容老 rounds 数据)。
function hasAvatar(r: AssistantRoundItem): boolean {
  return !!(r.role || r.author)
}
function authorName(r: AssistantRoundItem): string {
  return r.author?.name || (r.role === 'human' ? '我' : r.role === 'ai' ? 'AI' : '')
}

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

// CHG-018 拖拽对标 Discourse d-draggable / topic-timeline container.gjs:
// 旧实现的两个致命缺陷 —
//   (1) pointer 监听只挂在 13px 手柄上 → 点轨道其余位置/刻度无反应（"点不动"）；
//   (2) 手柄 top 纯由 meta.current 派生（IntersectionObserver 驱动），拖拽时手柄不跟
//       光标，要等滚动回报才动 → 体感"拖不动 / 跳回"。
// 修复：把 pointer 链挂到整条轨道（scrollRef），pointerdown 即 setPointerCapture →
// move/up 继续投递（拖出轨道不断）；拖拽过程维护本地 dragRatio 实时驱动手柄位置
// （Discourse commit() 在 dragging 时只更新视觉），松手仍持续 emit('seek') 联动滚动。
// 点轨道任意处 = 同一 ratioFromY → 立即 seek（对标 d-draggable 轨道点击）。
const scrollRef = ref<HTMLElement | null>(null)
const dragging = ref(false)
const dragRatio = ref(0)

// persistent 手柄位置 (%)：拖拽中跟随光标 (dragRatio)，否则跟随 meta.current。
const handleTop = computed(() => {
  if (dragging.value) return dragRatio.value * 100
  const m = props.meta
  if (!m || m.total <= 1) return 0
  return ((m.current - 1) / (m.total - 1)) * 100
})

function ratioFromY(clientY: number): number {
  const el = scrollRef.value
  if (!el) return 0
  const rect = el.getBoundingClientRect()
  // CHG-015 P16: 轨道 3px 宽 + flex:1, 某些布局下 getBoundingClientRect().height 可能瞬时
  // 为 0 (父高未结算 / transform 中) → 旧实现直接 return 0 使 seek 永远跳到顶 (ratio 恒 0)。
  // 退化时回落到 offsetHeight (CSS min-height:120px 保证非 0), 仍 0 才放弃。
  const height = rect.height || el.offsetHeight
  if (!height) return 0
  return Math.max(0, Math.min(1, (clientY - rect.top) / height))
}

function onPointerDown(ev: PointerEvent): void {
  dragging.value = true
  dragRatio.value = ratioFromY(ev.clientY)
  scrollRef.value?.setPointerCapture(ev.pointerId)
  emit('seek', dragRatio.value)
  ev.preventDefault()
}
function onPointerMove(ev: PointerEvent): void {
  if (!dragging.value) return
  dragRatio.value = ratioFromY(ev.clientY)
  emit('seek', dragRatio.value)
}
function onPointerUp(ev: PointerEvent): void {
  if (!dragging.value) return
  dragging.value = false
  if (scrollRef.value?.hasPointerCapture(ev.pointerId)) {
    scrollRef.value.releasePointerCapture(ev.pointerId)
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
      <!-- CHG-015 9a: 内联短标签 — 之前右缘只有刻度 tick, 标题藏在 hover 浮窗
           (display:none) → 用户「文字太少」。补一个常驻的极短标签层 (#N + 标题首段),
           hover 仍展开完整浮窗。current 行加粗/高亮。 -->
      <span class="v6-rn-lbl" :title="r.title">
        <span class="v6-rn-lbl-n">#{{ r.index }}</span>
        <span class="v6-rn-lbl-t">{{ r.title }}</span>
      </span>
      <i />
      <span class="v6-rp">
        <!-- P4 (Gap-5): 浮窗头部 = 头像 + 作者名 + #N (对标 v6:1552/1702)。
             role/author 缺则降级为原 #N + 标题 (向后兼容)。 -->
        <span v-if="hasAvatar(r)" class="v6-rp-head">
          <RoundAvatar
            class="v6-rp-av"
            size="sm"
            :role="r.role"
            :avatar-key="r.author?.avatarKey"
            :avatar-url="r.author?.avatarUrl"
            :initial="r.author?.initial"
            :name="authorName(r)"
          />
          <b v-if="authorName(r)" class="v6-rp-author">{{ authorName(r) }}</b>
          <span class="v6-rndchip v6-rp-num">#{{ r.index }}</span>
        </span>
        <span class="v6-rpn">
          <span v-if="!hasAvatar(r)" class="v6-rndchip">#{{ r.index }}</span>
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
    <!-- CHG-018: pointer 链挂在整条轨道 — 点轨道任意处即 seek, 拖拽 setPointerCapture
         全程跟手 (对标 Discourse d-draggable)。touch-action:none 让触摸拖拽不滚页面。 -->
    <div
      ref="scrollRef"
      class="v6-tline-scroll"
      :class="{ dragging }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
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
        <!-- P4 (Gap-5): topic 楼层浮窗 = 发帖人头像 + 作者名 + #N + 首行 (v6:1702 范式)。
             role/author 缺则降级为 #N + 标题 (向后兼容老数据)。 -->
        <span class="v6-tkp">
          <span v-if="hasAvatar(r)" class="v6-tkp-head">
            <RoundAvatar
              size="sm"
              :role="r.role"
              :avatar-key="r.author?.avatarKey"
              :avatar-url="r.author?.avatarUrl"
              :initial="r.author?.initial"
              :name="authorName(r)"
            />
            <b v-if="authorName(r)" class="v6-tkp-author">{{ authorName(r) }}</b>
            <span class="v6-rndchip v6-tkp-num">#{{ r.index }}</span>
            <span class="v6-tkp-t">{{ r.title }}</span>
          </span>
          <template v-else>
            <span class="v6-rndchip">#{{ r.index }}</span>
            <span class="v6-tkp-t">{{ r.title }}</span>
          </template>
        </span>
      </button>
      <!-- 拖拽手柄: 视觉旋钮 + role=slider + 键盘步进。CHG-018: pointer 拖拽由父轨道
           统一处理 (手柄上的 pointerdown 冒泡到轨道即触发), 手柄自身只保留键盘可达性,
           不再单独绑 pointer (消除"只有手柄能拖"的死区)。 -->
      <div
        class="v6-tline-hd"
        :class="{ dragging }"
        :style="{ top: handleTop + '%' }"
        role="slider"
        tabindex="0"
        aria-label="时间线位置"
        :aria-valuemin="1"
        :aria-valuemax="meta?.total ?? 1"
        :aria-valuenow="meta?.current ?? 1"
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
/* 9a: 常驻内联短标签 (刻度左侧)。窄而省略 — 给「这一轮讲了什么」一个最小可读锚,
   不抢内容区宽度; hover 仍弹完整 v6-rp 浮窗。 */
.v6-rn-lbl {
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 116px;
  margin-right: 5px;
  font-size: 9.5px;
  line-height: 1.3;
  color: var(--dw-mu);
  opacity: 0.7;
  transition: opacity 0.12s, color 0.12s;
}
.v6-rn:hover .v6-rn-lbl { opacity: 1; color: var(--dw-fg); }
.v6-rn.cur .v6-rn-lbl { opacity: 1; color: var(--dw-fg); font-weight: 600; }
.v6-rn-lbl-n {
  font-family: var(--dw-mono);
  font-size: 8.5px;
  color: var(--dw-ac);
  flex-shrink: 0;
}
.v6-rn-lbl-t {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.v6-rn i {
  width: 11px;
  height: 2.5px;
  border-radius: 2px;
  background: var(--dw-mu);
  opacity: 0.35;
  transition: width 0.12s, opacity 0.12s;
  flex-shrink: 0;
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
/* P4 (Gap-5): hover 浮窗头部 — 头像 + 作者名 + #N (右对齐), 在标题行之上。 */
.v6-rp-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 5px;
}
.v6-rp-author {
  font-size: 11px;
  font-weight: 600;
  color: var(--dw-fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.v6-rp-num { margin-left: auto; }
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
  /* CHG-018: 触摸拖拽不滚页面 + grab 光标提示整条可拖/可点。 */
  touch-action: none;
  cursor: pointer;
}
.v6-tline-scroll.dragging { cursor: grabbing; }
/* CHG-018: 透明命中区横向扩张 (各 ~14px) — 视觉仍 3px 细轨, 但点/拖整条时间线列
   任意位置都落在轨道上 (对标 Discourse 轨道点击即 seek)。刻度 button/手柄是其子元素,
   pointerdown 冒泡到轨道即触发拖拽; 纯点击刻度仍走刻度自身的 goto。 */
.v6-tline-scroll::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -14px;
  right: -14px;
  z-index: 0;
}
.v6-tline-hd {
  position: absolute;
  /* CHG-015 P16: 可视旋钮仍窄 (13px), 但命中区放大到 28px 宽 / 多 8px 上下,
     用透明 ::before 扩张 (不改旋钮观感)。z-index 抬到刻度 (v6-tk2) 之上, 否则
     刻度 button 截走 pointerdown → 拖不动。 */
  left: -5px;
  width: 13px;
  height: 34px;
  background: var(--dw-sf3);
  border: 1px solid var(--dw-mu);
  border-radius: 7px;
  cursor: grab;
  transform: translateY(-50%);
  touch-action: none;  /* F6: 让 pointer 拖拽吃掉触摸手势，不滚页面 */
  z-index: 3;
}
/* P16: 透明命中区扩张 — 比旋钮各向外扩 (左右各 ~7px, 上下各 8px), 让窄手柄好抓。
   ::before 继承 pointer 事件, pointerdown 落在它上即触发拖拽 (它是 hd 的一部分)。 */
.v6-tline-hd::before {
  content: '';
  position: absolute;
  top: -8px;
  bottom: -8px;
  left: -8px;
  right: -8px;
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
/* P4 (Gap-5): 含头像的楼层浮窗 — 头部 (头像+作者+#N) 一行, 首行标题换行其下。 */
.v6-tkp-head {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  flex-wrap: wrap;
}
.v6-tkp-author {
  font-size: 11px;
  font-weight: 600;
  color: var(--dw-fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.v6-tkp-num { margin-left: auto; }
/* 首行标题: 含头像时占满整行 (在头部之下), 否则维持 inline 行内省略。 */
.v6-tkp-head .v6-tkp-t { flex: 1 0 100%; }
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
