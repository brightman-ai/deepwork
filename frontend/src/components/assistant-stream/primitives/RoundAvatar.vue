<script setup lang="ts">
// CHG-014 P4 (Gap-5): RoundAvatar — RunStream/Topic 楼层导航的仿头像原语。
//
// 对标 v6 原型 `.av`/`.av.sm` (行 80-81) + 楼层浮窗 `<span class="av sm ...">` (v6:1702/1552)。
// 区分 AI / Human / 多角色:
//   - role='human' → 暖琥珀 (v6 av-1, = --dw-ac), 字母兜底 'H'
//   - role='ai'    → 蓝     (v6 av-2, = --dw-blu), 字母兜底 'A'
//   - 其余角色 / 显式 avatarKey ('av-1'..'av-5' 或任意 seed) → 5 档 oklch 色 (v6 av-1..5)
//   - avatarUrl 存在 → 渲染真实头像图 (优先于仿头像字母)
//
// 为何不复用 @ce ui/avatar (reka-ui): 那套用 tailwind bg-secondary / h-10 (40px),
// 与 v6 `.av` 的 oklch 五档色板 + 18px sm 尺寸是两种设计语汇; RoundNav 全程走 v6
// `.v6-*` 原始 CSS + --dw-* tokens, 用 v6 对齐的最小原语视觉一致, 不引 tailwind 依赖。
// 色档复用 tokens.css 已有的 --dw-ac/blu/ok/pur/warn (= v6 av-1..5 同 oklch 值), 不新增全局。
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  role?: string             // 'human' | 'ai' | 其他角色
  avatarKey?: string        // 'av-1'..'av-5' 显式色 / 'human' / 'ai' / 任意 seed
  avatarUrl?: string        // 真实头像图 (优先)
  initial?: string          // 仿头像字母 (缺则自动推断)
  name?: string             // 作者名 (字母兜底 + alt)
  size?: 'sm' | 'md'        // sm=18px (浮窗内), md=24px (默认)
}>(), {
  size: 'md',
})

// 5 档色键 (v6 av-1..5) → tokens.css 已有 oklch 变量 (值 1:1)。
const PALETTE = ['av-1', 'av-2', 'av-3', 'av-4', 'av-5'] as const

// 把 seed 字符串哈希到 5 档之一 (与 pro PostCard hashClass 同算法语义)。
function hashKey(seed: string): typeof PALETTE[number] {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

// 解析最终色档 class。优先级: 显式 avatarKey > role 语义 > name 哈希。
const colorClass = computed<string>(() => {
  const key = props.avatarKey?.trim()
  if (key) {
    if (PALETTE.includes(key as typeof PALETTE[number])) return key       // 显式 av-N
    if (key === 'human') return 'av-1'
    if (key === 'ai') return 'av-2'
    return hashKey(key)                                                    // 任意 seed
  }
  const role = props.role
  if (role === 'human') return 'av-1'
  if (role === 'ai') return 'av-2'
  return hashKey(props.name || role || '?')
})

// 仿头像字母: 显式 initial > name 首字 > role 兜底 (H/A) > '·'。
const letter = computed<string>(() => {
  const init = props.initial?.trim()
  if (init) return init.slice(0, 1).toUpperCase()
  const nm = props.name?.trim()
  if (nm) return nm.slice(0, 1).toUpperCase()
  if (props.role === 'human') return 'H'
  if (props.role === 'ai') return 'A'
  return '·'
})
</script>

<template>
  <span
    class="v6-av"
    :class="[colorClass, { sm: size === 'sm' }]"
    :title="name"
    :aria-label="name || (role === 'human' ? '人类' : role === 'ai' ? 'AI' : '参与者')"
  >
    <img v-if="avatarUrl" :src="avatarUrl" :alt="name || ''" class="v6-av-img" />
    <template v-else>{{ letter }}</template>
  </span>
</template>

<style scoped>
/* v6 `.av` (行 80-81): 24px 圆, 暗字, grid 居中; .sm = 18px。色板复用 tokens 已有 oklch。 */
.v6-av {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: inline-grid;
  place-items: center;
  font-size: 10px;
  font-weight: 600;
  color: #0d0d0f;            /* v6: 暗字配亮色头像底 (oklch 色都较亮) */
  flex-shrink: 0;
  overflow: hidden;
  line-height: 1;
}
.v6-av.sm { width: 18px; height: 18px; font-size: 8px; }
.v6-av-img { width: 100%; height: 100%; object-fit: cover; }

/* 5 档 = v6 av-1..5, 值 = tokens.css 已有变量 (oklch 1:1, 避免新增全局色)。 */
.v6-av.av-1 { background: var(--dw-ac); }    /* 暖琥珀 — human */
.v6-av.av-2 { background: var(--dw-blu); }   /* 蓝 — ai */
.v6-av.av-3 { background: var(--dw-ok); }    /* 绿 */
.v6-av.av-4 { background: var(--dw-pur); }   /* 紫 */
.v6-av.av-5 { background: var(--dw-warn); }  /* 黄 */
</style>
