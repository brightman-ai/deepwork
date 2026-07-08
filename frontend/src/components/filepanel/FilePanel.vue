<script setup lang="ts">
/**
 * FilePanel — the ONE shared right-sidebar file panel (SSOT). Data-source-agnostic: the
 * host injects a FileSource (terminal cli / ws-portal owner / share-visitor grant). The
 * component owns the UX only — 最近(touched) + 目录(browse) tabs, fuzzy filter, category
 * chips, recursive search, format-aware preview (text/image/binary/oversized) and authed
 * download — never any endpoint/auth knowledge. caps gate every affordance (no dead UI).
 */
import { ref, computed, watch, onUnmounted } from 'vue'
import { RefreshCw, Download, ArrowLeft, FolderUp, File as FileIc, Folder as FolderIc } from 'lucide-vue-next'
import type { FileSource, FileEntry, FileContent } from './types'
import { fuzzyMatch } from './fuzzyMatch'
import FilePreview from './FilePreview.vue'
import FileSearchBox from './FileSearchBox.vue'

const props = defineProps<{
  source: FileSource
  /** panel title. */
  title?: string
}>()

type Tab = 'touched' | 'browse'
const tabs = computed<{ id: Tab; label: string }[]>(() => {
  const t: { id: Tab; label: string }[] = []
  if (props.source.caps.touched) t.push({ id: 'touched', label: '最近' })
  if (props.source.caps.browse) t.push({ id: 'browse', label: '目录' })
  return t
})
const tab = ref<Tab>('touched')
watch(tabs, (t) => { if (!t.some((x) => x.id === tab.value) && t.length) tab.value = t[0].id }, { immediate: true })

const loading = ref(false)
const error = ref('')

// ── 最近 (touched) ────────────────────────────────────────────────────────────
const touched = ref<FileEntry[]>([])
const touchedQuery = ref('')
type Cat = 'all' | 'doc' | 'code' | 'config' | 'image' | 'other'
const cat = ref<Cat>('all')
const CATS: { id: Cat; label: string }[] = [
  { id: 'all', label: '全部' }, { id: 'doc', label: '文档' }, { id: 'code', label: '代码' },
  { id: 'config', label: '配置' }, { id: 'image', label: '图片' }, { id: 'other', label: '其他' },
]
function categoryOf(name: string): Exclude<Cat, 'all'> {
  const e = (name.split('.').pop() || '').toLowerCase()
  if (['md', 'markdown', 'txt', 'rst', 'adoc'].includes(e)) return 'doc'
  if (['go', 'ts', 'tsx', 'js', 'jsx', 'vue', 'py', 'rs', 'rb', 'java', 'c', 'h', 'cpp', 'cs', 'php', 'sh', 'sql', 'lua', 'kt', 'swift'].includes(e)) return 'code'
  if (['json', 'yaml', 'yml', 'toml', 'ini', 'conf', 'env', 'xml', 'lock'].includes(e)) return 'config'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(e)) return 'image'
  return 'other'
}
const filteredTouched = computed(() =>
  touched.value.filter((f) =>
    (cat.value === 'all' || categoryOf(f.name) === cat.value) && fuzzyMatch(touchedQuery.value, f.path),
  ),
)

async function loadTouched(): Promise<void> {
  if (!props.source.caps.touched) return
  loading.value = true; error.value = ''
  try { touched.value = await props.source.listTouched() }
  catch (e) { error.value = e instanceof Error ? e.message : '加载失败'; touched.value = [] }
  finally { loading.value = false }
}

// ── 目录 (browse) ─────────────────────────────────────────────────────────────
const dir = ref('')
const entries = ref<FileEntry[]>([])
async function loadDir(path: string): Promise<void> {
  if (!props.source.caps.browse) return
  loading.value = true; error.value = ''
  try {
    const res = await props.source.listDir(path)
    dir.value = res.dir || ''
    entries.value = (res.entries || []).slice().sort((a, b) =>
      a.is_dir !== b.is_dir ? (a.is_dir ? -1 : 1) : a.name.localeCompare(b.name))
  } catch (e) { error.value = e instanceof Error ? e.message : '加载目录失败'; entries.value = [] }
  finally { loading.value = false }
}
function goUp(): void { if (dir.value) void loadDir(dir.value.split('/').slice(0, -1).join('/')) }

// recursive search (server-side, debounced) — replaces the dir listing while active.
const treeQuery = ref('')
const searchHits = ref<FileEntry[] | null>(null)
const searchTruncated = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | null = null
let searchSeq = 0
watch(treeQuery, (q) => {
  if (searchTimer) clearTimeout(searchTimer)
  if (!q.trim() || !props.source.caps.search || !props.source.search) { searchHits.value = null; return }
  const seq = ++searchSeq
  searchTimer = setTimeout(async () => {
    try {
      const res = await props.source.search!(q)
      if (seq !== searchSeq) return
      searchHits.value = res.entries; searchTruncated.value = res.truncated
    } catch { if (seq === searchSeq) searchHits.value = [] }
  }, 250)
})
onUnmounted(() => { if (searchTimer) clearTimeout(searchTimer) })

// ── preview ───────────────────────────────────────────────────────────────────
const view = ref<'list' | 'preview'>('list')
const cur = ref<FileContent | null>(null)
const curName = computed(() => (cur.value?.path.split('/').pop()) || cur.value?.path || '')
const isImage = computed(() => cur.value?.encoding === 'base64' && /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(cur.value.path))
const isBinary = computed(() => cur.value?.encoding === 'base64' && !isImage.value)

async function openEntry(e: FileEntry): Promise<void> {
  if (e.is_dir) { void loadDir(e.path); return }
  loading.value = true; error.value = ''
  try { cur.value = await props.source.readFile(e.path); view.value = 'preview' }
  catch (err) { error.value = err instanceof Error ? err.message : '加载文件失败' }
  finally { loading.value = false }
}
function closePreview(): void { view.value = 'list'; cur.value = null }

async function doDownload(): Promise<void> {
  if (!cur.value || !props.source.caps.download) return
  try {
    const blob = await props.source.download(cur.value.path)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = curName.value
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  } catch { /* honest: surface nothing, the button stays */ }
}

function refresh(): void { if (tab.value === 'touched') void loadTouched(); else void loadDir(dir.value) }

// initial + source change: load the active tab's data.
watch(() => props.source, () => {
  closePreview()
  if (props.source.caps.touched) void loadTouched()
  else if (props.source.caps.browse) void loadDir('')
}, { immediate: true })
watch(tab, (t) => { if (t === 'browse' && !entries.value.length) void loadDir('') })
</script>

<template>
  <div class="fp" data-testid="file-panel">
    <header class="fp-head">
      <span class="fp-title">{{ title || '文件' }}</span>
      <div class="fp-tabs">
        <button
          v-for="t in tabs" :key="t.id"
          class="fp-tab" :class="{ 'is-on': tab === t.id }"
          type="button" :data-testid="`file-tab-${t.id}`"
          @click="tab = t.id"
        >{{ t.label }}</button>
      </div>
      <button class="fp-icbtn" type="button" title="刷新" @click="refresh"><RefreshCw class="fp-ic" /></button>
    </header>

    <!-- preview -->
    <div v-if="view === 'preview' && cur" class="fp-preview">
      <div class="fp-preview-head">
        <button class="fp-back" type="button" @click="closePreview"><ArrowLeft class="fp-ic" /> 返回</button>
        <span class="fp-preview-name" :title="cur.path">{{ cur.path }}</span>
        <button v-if="source.caps.download" class="fp-icbtn" type="button" title="下载" data-testid="file-download" @click="doDownload"><Download class="fp-ic" /></button>
      </div>
      <div class="fp-preview-body">
        <img v-if="isImage" class="fp-img" :src="`data:image/*;base64,${cur.content}`" :alt="curName" />
        <div v-else-if="isBinary || cur.truncated" class="fp-binary">
          <div class="fp-binary-t">{{ cur.truncated ? '文件较大，未内联预览' : '二进制文件，无法预览' }}</div>
          <button v-if="source.caps.download" class="fp-dlbtn" type="button" @click="doDownload"><Download class="fp-ic" /> 下载查看</button>
        </div>
        <FilePreview v-else :name="curName" :text="cur.content" />
      </div>
    </div>

    <!-- list -->
    <template v-else>
      <!-- 最近 (touched) -->
      <div v-if="tab === 'touched'" class="fp-body">
        <div class="fp-filterbar"><FileSearchBox v-model="touchedQuery" placeholder="过滤涉及文件…" testid="file-touched-search" /></div>
        <div class="fp-chips">
          <button v-for="c in CATS" :key="c.id" class="fp-chip" :class="{ 'is-on': cat === c.id }" type="button" @click="cat = c.id">{{ c.label }}</button>
        </div>
        <div class="fp-list">
          <div v-if="loading" class="fp-hint">加载中…</div>
          <div v-else-if="error" class="fp-err">{{ error }}</div>
          <div v-else-if="!filteredTouched.length" class="fp-hint">{{ touched.length ? '无匹配' : '本会话未涉及文件' }}</div>
          <button v-for="e in filteredTouched" :key="e.path" class="fp-row" :title="e.path" @click="openEntry(e)">
            <FileIc class="fp-row-ic" />
            <span class="fp-row-name">{{ e.name }}</span>
            <span v-if="e.tool" class="fp-row-tag">{{ e.tool }}</span>
          </button>
        </div>
      </div>

      <!-- 目录 (browse) -->
      <div v-else class="fp-body">
        <div v-if="source.caps.search" class="fp-filterbar"><FileSearchBox v-model="treeQuery" placeholder="搜索文件名…" testid="file-tree-search" /></div>
        <div class="fp-list">
          <div v-if="searchHits !== null">
            <div v-if="searchTruncated" class="fp-warn">结果过多，请缩小搜索</div>
            <div v-if="!searchHits.length" class="fp-hint">无匹配</div>
            <button v-for="e in searchHits" :key="e.path" class="fp-row" :title="e.path" @click="openEntry(e)">
              <FileIc class="fp-row-ic" /><span class="fp-row-name">{{ e.path }}</span>
            </button>
          </div>
          <template v-else>
            <button v-if="dir" class="fp-row fp-up" @click="goUp"><FolderUp class="fp-row-ic" /> 上一级</button>
            <div v-if="loading" class="fp-hint">加载中…</div>
            <div v-else-if="error" class="fp-err">{{ error }}</div>
            <div v-else-if="!entries.length" class="fp-hint">（空目录）</div>
            <button v-for="e in entries" :key="e.path" class="fp-row" :class="{ 'is-dir': e.is_dir }" :title="e.path" @click="openEntry(e)">
              <component :is="e.is_dir ? FolderIc : FileIc" class="fp-row-ic" />
              <span class="fp-row-name">{{ e.name }}</span>
              <span v-if="!e.is_dir" class="fp-row-size">{{ e.size }}B</span>
            </button>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.fp { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--dw-sf, hsl(var(--card))); }
.fp-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--dw-bd, hsl(var(--border))); flex-shrink: 0; }
.fp-title { font-size: 12px; font-weight: 600; color: var(--dw-fg, hsl(var(--foreground))); }
.fp-tabs { display: flex; gap: 2px; margin-left: 4px; }
.fp-tab { font-size: 11px; padding: 3px 9px; border-radius: 6px; border: none; background: none; cursor: pointer; color: var(--dw-mu, hsl(var(--muted-foreground))); }
.fp-tab:hover { background: var(--dw-sf2, hsl(var(--muted))); color: var(--dw-fg, hsl(var(--foreground))); }
.fp-tab.is-on { background: var(--dw-ac-dim, hsl(var(--muted))); color: var(--dw-ac, hsl(var(--primary))); font-weight: 600; }
.fp-icbtn { margin-left: auto; border: none; background: none; cursor: pointer; padding: 4px; border-radius: 6px; color: var(--dw-mu, hsl(var(--muted-foreground))); }
.fp-icbtn:hover { background: var(--dw-sf2, hsl(var(--muted))); color: var(--dw-fg, hsl(var(--foreground))); }
.fp-ic { width: 14px; height: 14px; }
.fp-body { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.fp-filterbar { padding: 7px 10px; border-bottom: 1px solid var(--dw-bd, hsl(var(--border))); flex-shrink: 0; }
.fp-chips { display: flex; gap: 4px; flex-wrap: wrap; padding: 6px 10px 2px; flex-shrink: 0; }
.fp-chip { font-size: 10px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--dw-bd, hsl(var(--border))); background: none; cursor: pointer; color: var(--dw-mu, hsl(var(--muted-foreground))); }
.fp-chip.is-on { border-color: var(--dw-ac, hsl(var(--primary))); color: var(--dw-ac, hsl(var(--primary))); background: var(--dw-ac-dim, hsl(var(--muted))); }
.fp-list { flex: 1; min-height: 0; overflow-y: auto; padding: 4px; }
.fp-row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 5px 8px; border: none; background: none; cursor: pointer; border-radius: 6px; font-size: 12px; text-align: left; color: var(--dw-fg, hsl(var(--foreground))); }
.fp-row:hover { background: var(--dw-sf2, hsl(var(--muted))); }
.fp-row-ic { width: 14px; height: 14px; flex-shrink: 0; color: var(--dw-mu, hsl(var(--muted-foreground))); }
.fp-row-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fp-row-size { flex-shrink: 0; font-family: var(--dw-mono, monospace); font-size: 10px; color: var(--dw-mu, hsl(var(--muted-foreground))); }
.fp-row-tag { flex-shrink: 0; font-family: var(--dw-mono, monospace); font-size: 9px; padding: 1px 5px; border-radius: 4px; background: var(--dw-sf3, hsl(var(--muted))); color: var(--dw-mu, hsl(var(--muted-foreground))); }
.fp-up { color: var(--dw-mu, hsl(var(--muted-foreground))); }
.fp-hint, .fp-err, .fp-warn { padding: 12px; font-size: 12px; color: var(--dw-mu, hsl(var(--muted-foreground))); }
.fp-err { color: var(--dw-red, hsl(var(--destructive))); }
.fp-warn { color: var(--dw-warn, oklch(74% 0.12 62)); }
.fp-preview { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.fp-preview-head { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--dw-bd, hsl(var(--border))); flex-shrink: 0; }
.fp-back { display: inline-flex; align-items: center; gap: 4px; border: none; background: none; cursor: pointer; font-size: 12px; color: var(--dw-ac, hsl(var(--primary))); }
.fp-preview-name { flex: 1; font-family: var(--dw-mono, monospace); font-size: 11px; color: var(--dw-mu, hsl(var(--muted-foreground))); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fp-preview-body { flex: 1; min-height: 0; overflow: hidden; }
.fp-img { max-width: 100%; height: auto; display: block; margin: 12px auto; }
.fp-binary { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 32px; color: var(--dw-mu, hsl(var(--muted-foreground))); }
.fp-binary-t { font-size: 12px; }
.fp-dlbtn, .fp-binary .fp-dlbtn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 8px; border: 1px solid var(--dw-ac, hsl(var(--primary))); background: var(--dw-ac-dim, hsl(var(--muted))); color: var(--dw-ac, hsl(var(--primary))); cursor: pointer; font-size: 12px; }
</style>
