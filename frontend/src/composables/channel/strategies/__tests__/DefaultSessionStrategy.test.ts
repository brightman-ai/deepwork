import { describe, expect, it } from 'bun:test'
import { ref } from 'vue'
import { DefaultSessionStrategy } from '../DefaultSessionStrategy'

describe('DefaultSessionStrategy dispatch controls', () => {
  it('forwards approval and preserves explicit empty controls', () => {
    const effort = ref('')
    const approval = ref('plan')
    const strategy = new DefaultSessionStrategy({
      sessionIdRef: ref(42),
      activeRef: ref(true),
      createPayload: {},
      effort: () => effort.value,
      approvalMode: () => approval.value,
    })

    expect(strategy.buildRequest(42, 'hello').body).toMatchObject({
      effort: '',
      approval_mode: 'plan',
    })

    approval.value = ''
    expect(strategy.buildRequest(42, 'again').body).toMatchObject({
      effort: '',
      approval_mode: '',
    })
  })

  it('omits controls for callers that do not own them', () => {
    const strategy = new DefaultSessionStrategy({
      sessionIdRef: ref(42),
      activeRef: ref(true),
      createPayload: {},
    })
    const body = strategy.buildRequest(42, 'hello').body
    expect(Object.prototype.hasOwnProperty.call(body, 'effort')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(body, 'approval_mode')).toBe(false)
  })
})
