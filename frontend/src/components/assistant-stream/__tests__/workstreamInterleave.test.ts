// live 装配的多轮交错保真（2026-07-22，对齐回放装配 mapTranscript 的相邻合并语义）。
// 病灶：旧 upsertTool 对新工具 findIndex 取**第一个** tool-group → 整轮所有工具被吸进
// 一个桶，text 边界后的工具永远不开新组，[叙述→工具→叙述→工具] 的时序在 live 层就丢了
//（回放层是相邻合并、保交错 → live/回放分叉）。新契约：分组严格**相邻** —— 尾块是
// tool-group 才并入，否则在尾部开新组。
import { describe, test, expect } from 'bun:test'
import { applyAssistantWorkstreamEvent, type AssistantWorkstreamEvent } from '../workstream'
import type { AssistantMessage } from '../types'

function drive(events: AssistantWorkstreamEvent[]): AssistantMessage {
  const messages: AssistantMessage[] = []
  const options = { messages, streamingStartedAt: 1000, now: () => 2000 }
  let current: AssistantMessage | null = null
  for (const e of events) current = applyAssistantWorkstreamEvent(e, current, options)
  if (!current) throw new Error('no message assembled')
  return current
}

describe('workstream 多轮交错装配（live ≡ replay 相邻合并）', () => {
  test('text→tool→text→tool 保持四块原时序，不塌成一个工具桶', () => {
    const msg = drive([
      { kind: 'text', content: '先看看文件。' },
      { kind: 'tool_start', tool: { id: 't1', name: 'Read' } },
      { kind: 'tool_result', tool: { id: 't1', name: 'Read', output: 'ok' } },
      { kind: 'text', content: '再跑测试。' },
      { kind: 'tool_start', tool: { id: 't2', name: 'Bash' } },
    ])
    const types = (msg.blocks ?? []).map((b) => b.type)
    expect(types).toEqual(['text', 'tool-group', 'text', 'tool-group'])
  })

  test('相邻工具仍合并进同一组（不是每个工具各开一组）', () => {
    const msg = drive([
      { kind: 'tool_start', tool: { id: 't1', name: 'Read' } },
      { kind: 'tool_start', tool: { id: 't2', name: 'Grep' } },
      { kind: 'tool_start', tool: { id: 't3', name: 'Bash' } },
    ])
    const blocks = msg.blocks ?? []
    expect(blocks).toHaveLength(1)
    expect((blocks[0] as { tools: unknown[] }).tools).toHaveLength(3)
  })

  test('晚到的 tool_result 更新原组里的那个工具，不在尾部重复出现', () => {
    const msg = drive([
      { kind: 'tool_start', tool: { id: 't1', name: 'Read' } },
      { kind: 'text', content: '读完了，分析一下。' },
      { kind: 'tool_start', tool: { id: 't2', name: 'Bash' } },
      { kind: 'tool_result', tool: { id: 't1', output: 'file body', duration_ms: 42 } },
    ])
    const blocks = msg.blocks ?? []
    expect(blocks.map((b) => b.type)).toEqual(['tool-group', 'text', 'tool-group'])
    const g1 = (blocks[0] as { tools: Array<{ id: string; output?: string; done?: boolean }> }).tools
    expect(g1).toHaveLength(1)
    expect(g1[0]!.output).toBe('file body')
    expect(g1[0]!.done).toBe(true)
    const g2 = (blocks[2] as { tools: Array<{ id: string }> }).tools
    expect(g2.map((t) => t.id)).toEqual(['t2'])
  })

  test('工具组之间夹 thinking 也会断组（相邻性对所有非组块一致）', () => {
    const msg = drive([
      { kind: 'tool_start', tool: { id: 't1', name: 'Read' } },
      { kind: 'thinking', content: '嗯……' },
      { kind: 'tool_start', tool: { id: 't2', name: 'Bash' } },
    ])
    expect((msg.blocks ?? []).map((b) => b.type)).toEqual(['tool-group', 'thinking', 'tool-group'])
  })
})
