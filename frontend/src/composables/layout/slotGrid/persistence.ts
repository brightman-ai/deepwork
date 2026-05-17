/**
 * SlotGrid 布局持久化 — 服务端 KV 单一真相源
 *
 * SSOT: 服务端 /api/kv/dpf-layout/:key (SQLite 持久化)
 * 无 localStorage — 消除跨设备缓存不一致问题
 *
 * 写: 内存态由 useSlotGrid 即时更新 → debounced PUT 到服务端 (500ms)
 * 读: portal mount 时 fetchServerLayout() 异步拉取 → 应用到 slotGrid
 *
 * 使用方无需关心存储细节，只调 save/fetch/reset 三个函数。
 */

import type { SlotGrid, SerializedSlotGrid, SerializedNode, SlotNode, SlotLeaf, SlotBranch } from './types'
import { apiGet, apiPut, apiDelete } from '@ce/api/client'

// ─── KV 配置 ──────────────────────────────────────────────────────────────────

const KV_NAMESPACE = 'dpf-layout'
const SAVE_DEBOUNCE_MS = 500

// ─── Debounce 状态 ─────────────────────────────────────────────────────────────

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()

// ─── 公开 API ─────────────────────────────────────────────────────────────────

/**
 * 保存布局到服务端 KV (debounced 500ms，拖拽期间不频繁写)
 *
 * 内存态由 useSlotGrid 自行管理，此函数仅负责持久化。
 * 连续快速调用只会触发最后一次写入。
 */
export function saveSlotGridLayout(
  portalId: string,
  scenario: string,
  platform: string,
  grid: SlotGrid
): void {
  const key = buildKey(portalId, scenario, platform)
  const serialized: SerializedSlotGrid = {
    version: 1,
    portal: portalId,
    scenario,
    platform,
    timestamp: Date.now(),
    grid: serializeNode(grid),
  }

  // 取消前一个 debounce timer
  const prev = pendingTimers.get(key)
  if (prev) clearTimeout(prev)

  // 新 debounce
  pendingTimers.set(key, setTimeout(() => {
    pendingTimers.delete(key)
    void kvPut(key, JSON.stringify(serialized)).catch(() => {
      // 网络失败静默 — 下次保存会覆盖
    })
  }, SAVE_DEBOUNCE_MS))
}

/**
 * 从服务端拉取布局 (async)
 *
 * Portal mount 时调用。返回 null 表示无自定义布局（使用 pattern 默认）。
 */
export async function fetchServerLayout(
  portalId: string,
  scenario: string,
  platform: string
): Promise<SlotGrid | null> {
  const key = buildKey(portalId, scenario, platform)
  try {
    const json = await kvGet(key)
    if (!json) return null

    const parsed: SerializedSlotGrid = JSON.parse(json)
    if (parsed.version !== 1) return null
    return deserializeNode(parsed.grid) as SlotGrid
  } catch {
    return null
  }
}

/**
 * 重置布局: 删除服务端 KV 条目
 */
export function resetSlotGridLayout(
  portalId: string,
  scenario: string,
  platform: string
): void {
  const key = buildKey(portalId, scenario, platform)

  // 取消挂起的 debounced save
  const prev = pendingTimers.get(key)
  if (prev) clearTimeout(prev)
  pendingTimers.delete(key)

  void kvDelete(key).catch(() => {})
}

// ─── KV Client ──────────────────────────────────────────────────────────────

interface KVResponse {
  namespace: string
  key: string
  value: string
}

async function kvGet(key: string): Promise<string | null> {
  try {
    const resp = await apiGet<KVResponse>(`/kv/${KV_NAMESPACE}/${encodeURIComponent(key)}`)
    return resp.value
  } catch {
    return null
  }
}

async function kvPut(key: string, value: string): Promise<void> {
  await apiPut<KVResponse>(`/kv/${KV_NAMESPACE}/${encodeURIComponent(key)}`, { value })
}

async function kvDelete(key: string): Promise<void> {
  try {
    await apiDelete(`/kv/${KV_NAMESPACE}/${encodeURIComponent(key)}`)
  } catch {}
}

// ─── 内部实现 ─────────────────────────────────────────────────────────────────

function buildKey(portalId: string, scenario: string, platform: string): string {
  return `${portalId}:${scenario}:${platform}`
}

function serializeNode(node: SlotNode | SlotGrid): SerializedNode {
  if ('orientation' in node && !('type' in node)) {
    const grid = node as SlotGrid
    return {
      type: 'branch',
      orientation: grid.orientation,
      children: grid.children.map(serializeNode),
      sizes: grid.sizes,
    }
  }

  if (node.type === 'leaf') {
    const leaf = node as SlotLeaf
    return {
      type: 'leaf',
      id: leaf.id,
      role: leaf.role,
      collapsed: leaf.collapsed,
      tabs: leaf.tabGroup.tabs.map((t) => ({
        id: t.id,
        label: t.label,
        adapterId: t.adapterId,
        adapterProps: t.adapterProps,
        pinned: t.pinned,
      })),
      activeTab: leaf.tabGroup.activeTabId,
    }
  }

  const branch = node as SlotBranch
  return {
    type: 'branch',
    orientation: branch.orientation,
    children: branch.children.map(serializeNode),
    sizes: branch.sizes,
  }
}

function deserializeNode(node: SerializedNode): SlotNode | SlotGrid {
  if (node.type === 'leaf') {
    const leaf: SlotLeaf = {
      type: 'leaf',
      id: node.id,
      role: node.role as SlotLeaf['role'],
      collapsed: node.collapsed ?? false,
      constraints: {
        minWidth: 200,
        minHeight: 100,
        collapsible: true,
        resizable: true,
        closable: false,
      },
      tabGroup: {
        tabs: (node.tabs ?? []).map((t) => ({
          id: t.id,
          label: t.label,
          adapterId: t.adapterId,
          adapterProps: t.adapterProps,
          pinned: t.pinned,
          closable: !t.pinned,
          dirty: false,
        })),
        activeTabId: node.activeTab ?? null,
        tabBarVisible: true,
        overflow: 'scroll',
      },
    }
    return leaf
  }

  const branch: SlotBranch = {
    type: 'branch',
    orientation: node.orientation as 'horizontal' | 'vertical',
    children: node.children.map((c) => deserializeNode(c) as SlotNode),
    sizes: node.sizes,
  }
  return branch
}
