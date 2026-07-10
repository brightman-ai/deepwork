import { reactive } from 'vue'
import type { PortalName } from './portalNav'

// Portal 导航位置记忆(SSOT): 每个 portal 最近访问的完整路径,使切走再回恢复深位(选中的
// ws/session/project)而非塌回无参 entry。一个 reactive 单例(localStorage 持久)——@ce 共享
// 无 Pinia。单点写(router afterEach), 单点读(rail 导航目标)。任何 portal 通用覆盖,零 per-portal 胶水。
const LS_KEY = 'v2:portal:location'

function load(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}')
  } catch {
    return {}
  }
}

const state = reactive<Record<string, string>>(load())

function persist() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state))
  } catch {
    /* localStorage 不可用忽略 */
  }
}

export function recordPortalLocation(portal: PortalName | null, fullPath: string): void {
  if (!portal || !fullPath) return
  if (state[portal] === fullPath) return
  state[portal] = fullPath
  persist()
}

export function portalLocationFor(portal: PortalName | null): string | undefined {
  return portal ? state[portal] : undefined
}
