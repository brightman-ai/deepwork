<script setup lang="ts">
// SlashCommandMenu — presentational overlay for the composer's "/" completion. Pure
// shell (零智能): renders the already-grouped sections + highlights the active row +
// emits select/hover/expand. All parsing, filtering, grouping and keyboard nav live in
// the assembling surface (AssistantStreamSurface) / slashCommands.ts; this component
// owns only presentation. Anchored above the composer (bottom: 100%) with --dw-*
// tokens, matching the MselPop idiom.
//
// Sections come from `kind` (技能 / 命令); the per-row badge comes from `source`
// (用户 / 项目). Two backend fields, two distinct jobs, no overlap — and `builtin`
// carries NO badge, because "内建" is the default and labelling the default is noise
// (12 of the ~86 rows here would otherwise wear an identical pill).
import { ref, watch } from 'vue'
import type { SlashCommand, SlashGroup } from '../slashCommands'

const props = defineProps<{
  groups: SlashGroup[]
  /** Index into the flat sequence (SlashView.flat) — sections map via `offset + i`. */
  activeIndex: number
}>()

const emit = defineEmits<{
  (e: 'select', index: number): void
  (e: 'hover', index: number): void
  (e: 'expand', key: string): void
}>()

// builtin deliberately absent — see header note.
const SOURCE_LABEL: Partial<Record<SlashCommand['source'], string>> = {
  user: '用户',
  project: '项目',
}

const rowsRef = ref<HTMLElement[]>([])
// Keep the highlighted row in view as ↑↓ moves through a long list.
watch(
  () => props.activeIndex,
  (i) => {
    rowsRef.value[i]?.scrollIntoView({ block: 'nearest' })
  },
)
</script>

<template>
  <div class="slash-menu" data-testid="slash-command-menu" role="listbox">
    <template v-for="g in groups" :key="g.key">
      <!-- 区标题带计数: 这台机器上真实有 31 技能 + 55 命令, 不报数就只剩"还有很多"的模糊感。
           aria-hidden + role=presentation —— 它是给眼睛的分隔, 不是可选项, 不该被读屏当条目念。 -->
      <div class="slash-menu__cap" role="presentation" data-testid="slash-command-group">
        <span class="slash-menu__cap-label">{{ g.label }}</span>
        <span class="slash-menu__cap-count">{{ g.total }}</span>
      </div>
      <button
        v-for="(cmd, i) in g.items"
        :key="cmd.name"
        :ref="(el) => { if (el) rowsRef[g.offset + i] = el as HTMLElement }"
        type="button"
        class="slash-menu__row"
        :class="{ 'slash-menu__row--active': g.offset + i === activeIndex }"
        role="option"
        :aria-selected="g.offset + i === activeIndex"
        data-testid="slash-command-item"
        @mousedown.prevent="emit('select', g.offset + i)"
        @mouseenter="emit('hover', g.offset + i)"
      >
        <span class="slash-menu__name">{{ cmd.name }}</span>
        <span v-if="cmd.desc" class="slash-menu__desc">{{ cmd.desc }}</span>
        <span
          v-if="SOURCE_LABEL[cmd.source]"
          class="slash-menu__badge"
          :class="`slash-menu__badge--${cmd.source}`"
        >{{ SOURCE_LABEL[cmd.source] }}</span>
      </button>
      <!-- 展开是鼠标/触摸的路; 键盘用户的路是继续打字过滤(一有查询 cap 即失效)。
           故意不进 flat 序列: ↑↓ 只该在"能被选中的命令"之间走。 -->
      <button
        v-if="g.total > g.items.length"
        type="button"
        class="slash-menu__more"
        data-testid="slash-command-more"
        @mousedown.prevent="emit('expand', g.key)"
      >显示全部 {{ g.total }} 个{{ g.label }}</button>
    </template>
  </div>
</template>

<style scoped>
.slash-menu {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  right: 0;
  max-height: 264px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 6px;
  background: var(--dw-sf2);
  border: 1px solid var(--dw-bd);
  border-radius: var(--dw-r3);
  box-shadow: 0 14px 40px rgb(0 0 0 / 0.5);
  z-index: 66;
}
/* 区标题吸顶: 长列表滚到一半时"我现在在看技能还是命令"必须始终答得上来。 */
.slash-menu__cap {
  flex: none;   /* 同 __row: 不许被压扁，见那里的注释 */
  position: sticky;
  top: -6px; /* 抵掉容器 padding，贴住真正的顶边 */
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 2px 0 1px;
  padding: 4px 9px 3px;
  background: var(--dw-sf2);
  font-size: 10.5px;
  letter-spacing: 0.04em;
  color: var(--dw-mu);
}
.slash-menu__cap-count {
  padding: 0 5px;
  border-radius: 999px;
  background: var(--dw-sf);
  font-family: var(--dw-mono);
  font-size: 9.5px;
  opacity: 0.75;
}
.slash-menu__row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  /* 容器是 flex column + max-height。flex 子项默认 flex-shrink:1 —— 内容总高超过
     max-height 时行会被**压扁到比内容还矮**，文字溢出压到下一行（移动端两行布局下是
     标题与上一条描述字母级重叠、完全不可读）。要的是容器滚动，不是行变矮。 */
  flex: none;
  padding: 7px 9px;
  border: 0;
  border-radius: var(--dw-r2);
  background: transparent;
  color: var(--dw-mu);
  cursor: pointer;
  text-align: left;
  font: inherit;
}
.slash-menu__row:hover,
.slash-menu__row--active {
  background: var(--dw-sf3);
  color: var(--dw-fg);
}
.slash-menu__name {
  flex-shrink: 0;
  font-family: var(--dw-mono);
  font-size: 12.5px;
  color: var(--dw-fg);
}
.slash-menu__desc {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  color: var(--dw-mu);
}
.slash-menu__badge {
  flex-shrink: 0;
  margin-left: auto;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-family: var(--dw-mono);
  background: var(--dw-sf);
  color: var(--dw-mu);
}
/* user = accent · project = blue（builtin 无徽章：默认无需标注）。 */
.slash-menu__badge--user {
  background: var(--dw-ac-dim);
  color: var(--dw-ac);
}
.slash-menu__badge--project {
  background: var(--dw-blu-dim);
  color: var(--dw-blu);
}
.slash-menu__more {
  flex: none;   /* 同 __row */
  width: 100%;
  padding: 6px 9px;
  border: 0;
  border-radius: var(--dw-r2);
  background: transparent;
  color: var(--dw-ac);
  cursor: pointer;
  text-align: left;
  font: inherit;
  font-size: 11.5px;
}
.slash-menu__more:hover {
  background: var(--dw-ac-dim);
}

/* 移动端：桌面那套单行 34px 高的行在手指下是不可点的（同一套样式表给发送键定的是 44px）。
   行改成两行网格（名字+徽章 / 描述），描述允许折两行 —— 手机上把 `/cw-experience-explore-full`
   和它的说明挤进一行的结果是两者都读不成。 */
@media (max-width: 768px) {
  /* 高度跟着**软键盘**走，不能用 vh —— vh 是布局视口，键盘弹起时纹丝不动。可见高度 =
     --dw-app-viewport-height − --dw-app-viewport-offset-top（main.ts 用 visualViewport
     实时写入，与 BrowserPanel 同一套）。实测键盘弹起 visualViewport 659→457，此变量随之
     变为 457px，菜单自动缩到键盘之上。
     取 0.7 而不是更保守的值: 用户此刻的唯一意图就是挑一条命令，把键盘上方的空间基本让给
     它是对的（实测 457 视口下 → 320px ≈ 7 行，而 0.45 只有 4.5 行、连"命令"区标题都要滚）。

     ⚠ 给下一个人: `audit --check browser-chrome-occlusion` 会把本菜单里**溢出滚动区**的
     行报成 "occluded by the soft keyboard"(occludedPx=44)。那是假阳 —— 它拿每个元素的
     getBoundingClientRect() 和键盘线比，不区分"被键盘盖住"与"在滚动容器里排在后面"。
     实测容器 y=160..366、键盘线 457，菜单整体在键盘之上；报的 /model 等行 rect y=581 是
     被 overflow 裁掉的内容，滚一下就能看见。行高从 34px 提到 44px(触摸标准)后溢出的行更
     多，该指标反而"更差" —— 别照着它去压行高。判据以几何实测为准。 */
  .slash-menu {
    max-height: clamp(
      132px,
      calc((var(--dw-app-viewport-height, 100dvh) - var(--dw-app-viewport-offset-top, 0px)) * 0.7),
      360px
    );
  }
  /* minmax(0,1fr) 而不是 1fr：grid 轨道默认 min-width:auto，长技能名（如
     /Threat Hunting & Detection Engineering）撑破轨道后与描述行叠字不可读。
     align-content 一并去掉——它和 min-height 一起会把超高的行居中溢出。 */
  .slash-menu__row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'name badge'
      'desc desc';
    align-items: start;
    gap: 3px 8px;
    min-height: 44px;
    padding: 8px 10px;
  }
  .slash-menu__name {
    grid-area: name;
    min-width: 0;
    overflow-wrap: anywhere;   /* 长名换行，而不是撑破轨道 */
    line-height: 1.3;
    font-size: 13px;
  }
  .slash-menu__badge {
    grid-area: badge;
    margin-left: 0;
  }
  .slash-menu__desc {
    grid-area: desc;
    white-space: normal;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    font-size: 11.5px;
    line-height: 1.35;
  }
  .slash-menu__more {
    min-height: 44px;
    font-size: 12.5px;
  }
}
</style>
