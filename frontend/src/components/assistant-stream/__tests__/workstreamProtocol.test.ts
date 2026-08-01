import { describe, expect, test } from 'bun:test'
import { applyAssistantWorkstreamEvent, type AssistantWorkstreamEvent } from '../workstream'
import type { AssistantMessage } from '../types'

function apply(events: AssistantWorkstreamEvent[], statuses: string[] = []): AssistantMessage | null {
  const messages: AssistantMessage[] = []
  let current: AssistantMessage | null = null
  for (const event of events) {
    current = applyAssistantWorkstreamEvent(event, current, {
      messages,
      streamingStartedAt: 100,
      now: () => 200,
      setWaitingStatus: (status) => statuses.push(status),
    })
  }
  return current
}

describe('workstream protocol projection', () => {
  test('artifact start/deltas/done converge on one complete artifact', () => {
    const message = apply([
      { kind: 'artifact_start', artifact: { id: 'a1', name: 'report.md', content_type: 'text/markdown' } },
      { kind: 'artifact_delta', artifact: { id: 'a1', delta: '# Report\n' } },
      { kind: 'artifact_delta', artifact: { id: 'a1', delta: 'done' } },
      { kind: 'artifact_done', artifact: { id: 'a1', complete: true } },
    ])
    const artifacts = (message?.blocks ?? []).filter((block) => block.type === 'artifact')
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toMatchObject({
      id: 'a1', name: 'report.md', contentType: 'text/markdown',
      content: '# Report\ndone', done: true, streaming: false,
    })
  })

  test('permission_resolved settles the existing request instead of duplicating it', () => {
    const message = apply([
      { kind: 'permission_request', permission: { id: 'p1', capabilities: ['shell'], summary: '运行测试' } },
      { kind: 'permission_resolved', permission: { id: 'p1', status: 'approved' } },
    ])
    const permissions = (message?.blocks ?? []).filter((block) => block.type === 'permission')
    expect(permissions).toHaveLength(1)
    expect(permissions[0]).toMatchObject({ id: 'p1', content: '运行测试', status: 'approved' })
  })

  test('projection lifecycle is visible through the waiting status channel', () => {
    const statuses: string[] = []
    apply([
      { kind: 'projection_start', projection: { target: 'README.md' } },
      { kind: 'projection_done', projection: { target: 'README.md' } },
    ], statuses)
    expect(statuses).toEqual(['正在投影至 README.md', '已投影至 README.md'])
  })
})
