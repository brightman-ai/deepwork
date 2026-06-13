<script setup lang="ts">
// CHG-014 D: cli-ic 引擎图标 (原型 .cli-ic)。
// cc=Claude Code (amber/C) · cx=Codex (中性/X) · gm=Gemini (蓝/G)。
import { computed } from 'vue'

const props = defineProps<{ engine: 'cc' | 'cx' | 'gm' }>()

const glyph = computed(() => ({ cc: 'C', cx: 'X', gm: 'G' }[props.engine]))
</script>

<template>
  <span class="v6-cli-ic" :class="`v6-cli-ic--${engine}`" data-testid="v6-cli-icon">{{ glyph }}</span>
</template>

<style scoped>
.v6-cli-ic {
  width: 15px;
  height: 15px;
  border-radius: 4px;
  display: inline-grid;
  place-items: center;
  font-family: var(--dw-mono);
  font-size: 8px;
  font-weight: 700;
  flex-shrink: 0;
}
.v6-cli-ic--cc { background: var(--dw-ac-dim); color: var(--dw-ac); }
.v6-cli-ic--cx { background: var(--dw-sf3); color: var(--dw-fg); }
.v6-cli-ic--gm { background: var(--dw-blu-dim); color: var(--dw-blu); }
</style>
