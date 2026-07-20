// isThinkingWithheld — 「想了但没给正文」的判据。
//
// 守的是第一版就犯过的错：当时按 thinking_tokens>0 一刀切地显示"看不到思考内容"，
// 于是**对 Haiku 用户撒谎** —— 它的思考是看得见的。判据必须逐轮取地面真相
// （这条消息自己有没有带正文的 thinking 块），不是按模型清单猜。
import { describe, test, expect } from 'bun:test'
import { isThinkingWithheld } from '../types'

const msg = (thinking: number | undefined, blocks: Array<{ type: string; content?: string }>) =>
  ({ usage: thinking === undefined ? undefined : { thinking_tokens: thinking }, blocks }) as never

describe('isThinkingWithheld', () => {
  test('想了 + 无思考块 → 隐去（Opus/Sonnet 的形态）', () => {
    expect(isThinkingWithheld(msg(517, [{ type: 'text', content: '答案' }]))).toBe(true)
  })

  test('★ 想了 + 有思考正文 → 不是隐去（Haiku 的形态，绝不能对它说"你看不到"）', () => {
    expect(isThinkingWithheld(msg(301, [{ type: 'thinking', content: '让我想想…' }]))).toBe(false)
  })

  test('思考块存在但正文是空串 → 仍算隐去（signature-only 的真实形态）', () => {
    expect(isThinkingWithheld(msg(517, [{ type: 'thinking', content: '' }]))).toBe(true)
  })

  test('空白字符不算正文', () => {
    expect(isThinkingWithheld(msg(517, [{ type: 'thinking', content: '   \n ' }]))).toBe(true)
  })

  test('没有思考 token → 无从谈起，不显示（不能把"没想"说成"藏了"）', () => {
    expect(isThinkingWithheld(msg(0, []))).toBe(false)
    expect(isThinkingWithheld(msg(undefined, []))).toBe(false)
  })

  test('blocks 缺失不炸', () => {
    expect(isThinkingWithheld({ usage: { thinking_tokens: 5 } } as never)).toBe(true)
  })
})
