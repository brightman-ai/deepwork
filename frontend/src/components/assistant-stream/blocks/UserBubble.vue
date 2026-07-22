<script setup lang="ts">
// CHG-014 D2: 新增 msg-u 右对齐用户泡 + rnd 轮次 chip (原型 997-998)。
// bub 中性 sf3 泡 (非彩色填充) + rnd 行 (#N chip + ‹ ›轮次切换 + 已编辑标注)。
import { computed, ref } from 'vue'
import ImageLightbox from '../ImageLightbox.vue'
import { resolveBubbleImages } from './parseImageRefs'

const props = defineProps<{
  content: string
  round?: number             // #N
  current?: number           // 当前 / 总数 显示
  total?: number
  edited?: boolean
  // 该气泡是"运行中被折进同一轮"的补充 → 显「↩ 已插入本轮」意符, 与普通轮视觉区分
  // (设计心理学: 事后能辨这是中途注入而非独立一轮)。
  //
  // 这个徽章说的是**已经发生的事实**, 不是承诺 —— 所以只由事后可核的来源产生:
  //   ① 回放: 后端 AgentRun.amendments (runtime 记录下"这一轮确实吸收了这段话");
  //   ② share collab 访客消息 steer 成功返回后的乐观气泡。
  // composer **不再**产生它: 会话内补充已改为「待发队列」(排队 + 本轮结束后作为新一轮
  // 发出) —— 提交那一刻我们无从知道上游会不会吸收, 当场宣称"已插入本轮"是守不住的承诺。
  // 换言之这里没有孤儿意符: 有生产者、且生产者给的都是既成事实。
  steered?: boolean
  // 「未发送」诚实态: 这条消息**从未被派发**(后端前移拦截 → 数据库零 turn 行),
  // 所以它不是"发出去了没人理", 而是"根本没发出去"。默认渲染的普通气泡会让用户
  // 一直等一个永远不会来的回复 —— 这里把它降权 + 明说原因 + 给出两条出路。
  //
  // 视觉走**降权**(虚线边 + 半透)而非红底告警: 用户没做错事, 是系统拒收; 红底会把
  // "改个模型再发"读成"出大事了"。
  unsent?: boolean
  unsentReason?: string
  // ws-ux-pro 诉求 E(点击放大)/G2(已发消息内图片预览): content 里的 `[图片] @path` /
  // 含图片扩展名的裸 `@path` 引用渲染成可点击缩略图（点击开 ImageLightbox）。消费点注入
  // rel_path→可访问URL 的解析函数；不传 = 维持纯文本，逐像素零回归——未接线的消费点
  // （chat/od 等）连 resolveBubbleImages 内部的解析尝试都不会发生，见 parseImageRefs.ts。
  resolveAttachmentUrl?: (path: string) => string | null
}>()

// unsent 动作**自门控**: 只有显式传 unsent 的消费点才会渲染这两个钮, 所以不存在
// "可点但无效"的死 UI (与 surface 的 blockActionable 门同一原则, 但无需消费点额外
// 打开一个全局开关 —— 那会连带点亮它并未接线的其它块内动作)。
const emit = defineEmits<{
  (e: 'nav', dir: -1 | 1): void
  (e: 'retry'): void
  (e: 'edit'): void
}>()

// 抽取逻辑本身是纯函数（parseImageRefs.ts），这里只是把 props 接进去——同 repo
// UsageFooter.vue ↔ isThinkingWithheld 的先例，逻辑单测覆盖，组件里只留一行 computed。
const images = computed(() => resolveBubbleImages(props.content, props.resolveAttachmentUrl))
const lightbox = ref<{ path: string; url: string } | null>(null)
</script>

<template>
  <div class="v6-msg-u" data-testid="assistant-user-bubble">
    <div class="v6-msg-u__col">
      <div class="v6-bub" :class="{ 'is-unsent': unsent }">{{ content }}</div>
      <!-- E/G2: 已发消息内图片缩略图行（点击放大）。resolveAttachmentUrl 未接线，或某条
           引用解析不出 URL 时 images 为空数组，整行不渲染——文本气泡逐像素不变。 -->
      <div v-if="images.length" class="v6-imgs" data-testid="user-bubble-images">
        <button
          v-for="img in images"
          :key="img.path"
          type="button"
          class="v6-imgthumb"
          :title="img.path"
          data-testid="user-bubble-image-thumb"
          @click="lightbox = img"
        >
          <img :src="img.url" :alt="img.path" loading="lazy" />
        </button>
      </div>
      <!-- 未发送行: 诚实说明 + 两条出路。unsent 为假时整行不渲染 → 既有消费点逐像素不变。 -->
      <div v-if="unsent" class="v6-unsent" data-testid="user-bubble-unsent">
        <span class="v6-unsent__label">未发送{{ unsentReason ? ` · ${unsentReason}` : '' }}</span>
        <button
          type="button"
          class="v6-unsent__act"
          data-testid="user-bubble-retry"
          title="用当前设置原地重发这一条"
          @click="emit('retry')"
        >重试</button>
        <button
          type="button"
          class="v6-unsent__act"
          data-testid="user-bubble-edit"
          title="把内容放回输入框修改"
          @click="emit('edit')"
        >编辑</button>
      </div>
      <div v-if="round !== undefined || total || steered" class="v6-rnd">
        <span v-if="round !== undefined" class="v6-rndchip">#{{ round }}</span>
        <button v-if="total && total > 1" type="button" @click="emit('nav', -1)">‹</button>
        <span v-if="total && total > 1">{{ current ?? 1 }} / {{ total }}</span>
        <button v-if="total && total > 1" type="button" @click="emit('nav', 1)">›</button>
        <span v-if="edited" class="v6-rnd__edited">已编辑</span>
        <span v-if="steered" class="v6-rnd__steered" title="运行中插入的补充，已折进当前轮（未新起一轮）">↩ 已插入本轮</span>
      </div>
    </div>
  </div>
  <ImageLightbox
    v-if="lightbox"
    :src="lightbox.url"
    :alt="lightbox.path"
    @close="lightbox = null"
  />
</template>

<style scoped>
.v6-msg-u {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
  min-width: 0; /* flex 子项默认 min-width:auto → 长串会把整条时间线撑出横滚 */
}
.v6-msg-u__col { max-width: 78%; min-width: 0; }
.v6-bub {
  background: var(--dw-sf3);
  border-radius: var(--dw-r3);
  padding: 10px 14px;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--dw-fg);
  white-space: pre-wrap;
  /* 粘贴进来的长 URL / 代码 / 无空格串必须硬折：实测一条用户消息把 timeline 的
     scrollWidth 顶到 2386px(视口 1821) → 整个会话横向滚动。 */
  overflow-wrap: anywhere;
  word-break: break-word;
}
/* 未发送 = 降权, 不是告警。虚线边说"这是个未完成的草稿态"，半透说"它不在对话里"。
   padding 减 1px 抵掉新增的 1px 边框 → 重发后气泡回到常态时不发生 1px 跳动。 */
.v6-bub.is-unsent {
  background: transparent;
  border: 1px dashed var(--dw-bd);
  padding: 9px 13px;
  opacity: 0.72;
}
/* E/G2 缩略图行：右对齐承接气泡的右对齐基调；小方图 + 悬停高亮，点击开 ImageLightbox。 */
.v6-imgs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
  margin-top: 6px;
}
.v6-imgthumb {
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  padding: 0;
  border: 1px solid var(--dw-bd);
  border-radius: var(--dw-r2);
  overflow: hidden;
  background: var(--dw-sf2);
  cursor: zoom-in;
}
.v6-imgthumb:hover { border-color: var(--dw-ac); }
.v6-imgthumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.v6-unsent {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: flex-end;
  flex-wrap: wrap;
  margin-top: 5px;
  font-family: var(--dw-mono);
  font-size: 10px;
  color: var(--dw-mu);
}
/* 原因文字用 warn 色: 够醒目让人知道"这条没发出去", 又不是 error 红底的"系统炸了"。 */
.v6-unsent__label {
  color: var(--dw-warn, var(--dw-mu));
  min-width: 0;
  overflow-wrap: anywhere;
  text-align: right;
}
.v6-unsent__act {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 5px;
  border: 1px solid var(--dw-bd);
  background: var(--dw-sf2);
  color: var(--dw-mu);
  font: inherit;
  font-size: 10px;
  cursor: pointer;
}
.v6-unsent__act:hover { background: var(--dw-sf3); color: var(--dw-fg); border-color: var(--dw-ac); }
.v6-rnd {
  display: flex;
  align-items: center;
  gap: 4px;
  justify-content: flex-end;
  margin-top: 5px;
  font-family: var(--dw-mono);
  font-size: 10px;
  color: var(--dw-mu);
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
.v6-rnd button {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.v6-rnd button:hover { background: var(--dw-sf2); color: var(--dw-fg); }
.v6-rnd__edited { margin-left: 4px; }
/* steer 意符: 低强度琥珀 pill(同 ThinkingBlock accent-dim), 标记"运行中插入本轮"——
   够醒目让用户事后一眼辨出这是中途注入的补充, 又不喧宾夺主盖过消息本身。 */
.v6-rnd__steered {
  display: inline-flex;
  align-items: center;
  margin-left: 4px;
  padding: 0 6px;
  height: 15px;
  border-radius: 8px;
  background: var(--dw-ac-dim);
  border: 1px solid var(--dw-ac-border-dim);
  color: var(--dw-ac);
  font-family: var(--dw-mono);
  font-size: 9px;
  flex-shrink: 0;
  cursor: default;
}
</style>
