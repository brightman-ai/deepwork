import { ref, computed } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { ScenarioMachineConfig, ScenarioState, LayoutPattern, SlotConfig } from './types'

export type { ScenarioMachineConfig, ScenarioState, LayoutPattern, SlotConfig }

export interface ScenarioMachineResult {
  current: Ref<string>
  currentState: ComputedRef<ScenarioState>
  layout: ComputedRef<LayoutPattern>
  slots: ComputedRef<Record<string, SlotConfig>>
  send: (event: string) => void
  canSend: (event: string) => boolean
  history: Ref<string[]>
  back: () => void
}

export function useScenarioMachine(
  _portalId: string,
  config: ScenarioMachineConfig,
): ScenarioMachineResult {
  const current = ref<string>(config.initial)
  const history = ref<string[]>([])

  const currentState = computed<ScenarioState>(() => {
    const state = config.states[current.value]
    if (!state) {
      console.warn(`[useScenarioMachine] Unknown state: "${current.value}"`)
      // Return a safe fallback to avoid crashes
      return { layout: 'solo', slots: {}, on: {} }
    }
    return state
  })

  const layout = computed<LayoutPattern>(() => currentState.value.layout)
  const slots  = computed<Record<string, SlotConfig>>(() => currentState.value.slots)

  function canSend(event: string): boolean {
    return event in currentState.value.on
  }

  function send(event: string): void {
    const target = currentState.value.on[event]
    if (!target) {
      console.warn(`[useScenarioMachine] No transition for event "${event}" in state "${current.value}"`)
      return
    }
    if (!(target in config.states)) {
      console.warn(`[useScenarioMachine] Transition target "${target}" not found in states`)
      return
    }

    // 检查守卫 — 未注册的事件直接通行
    const guard = config.guards?.[event]
    if (guard?.canTransition && !guard.canTransition(current.value, target)) {
      console.debug(`[useScenarioMachine] Guard blocked "${event}": ${current.value} → ${target}`)
      return
    }

    const from = current.value
    const doTransition = (): void => {
      history.value.push(from)
      current.value = target
      // afterEnter 异步执行，不阻塞状态更新
      const after = guard?.afterEnter?.(target)
      if (after instanceof Promise) after.catch(console.error)
    }

    // beforeLeave 支持异步；同步时直接转换避免微任务延迟
    const before = guard?.beforeLeave?.(from)
    if (before instanceof Promise) {
      before.then(doTransition).catch(console.error)
    } else {
      doTransition()
    }
  }

  function back(): void {
    const prev = history.value.pop()
    if (prev !== undefined) {
      current.value = prev
    }
  }

  return { current, currentState, layout, slots, send, canSend, history, back }
}
