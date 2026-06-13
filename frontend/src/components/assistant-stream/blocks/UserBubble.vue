<script setup lang="ts">
// CHG-014 D2: 新增 msg-u 右对齐用户泡 + rnd 轮次 chip (原型 997-998)。
// bub 中性 sf3 泡 (非彩色填充) + rnd 行 (#N chip + ‹ ›轮次切换 + 已编辑标注)。
defineProps<{
  content: string
  round?: number             // #N
  current?: number           // 当前 / 总数 显示
  total?: number
  edited?: boolean
}>()

const emit = defineEmits<{ (e: 'nav', dir: -1 | 1): void }>()
</script>

<template>
  <div class="v6-msg-u" data-testid="assistant-user-bubble">
    <div class="v6-msg-u__col">
      <div class="v6-bub">{{ content }}</div>
      <div v-if="round !== undefined || total" class="v6-rnd">
        <span v-if="round !== undefined" class="v6-rndchip">#{{ round }}</span>
        <button v-if="total && total > 1" type="button" @click="emit('nav', -1)">‹</button>
        <span v-if="total && total > 1">{{ current ?? 1 }} / {{ total }}</span>
        <button v-if="total && total > 1" type="button" @click="emit('nav', 1)">›</button>
        <span v-if="edited" class="v6-rnd__edited">已编辑</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.v6-msg-u {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}
.v6-msg-u__col { max-width: 78%; }
.v6-bub {
  background: var(--dw-sf3);
  border-radius: var(--dw-r3);
  padding: 10px 14px;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--dw-fg);
  white-space: pre-wrap;
}
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
</style>
