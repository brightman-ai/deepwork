/**
 * slashCommands — pure "/" completion helpers. Verifies the parse anchor (line-start /
 * post-whitespace only, never mid-word or in a URL), the local filter's ranking +
 * empty-query passthrough, and token replacement at the caret. DOM-free, so it runs
 * under bun:test with the REAL exported functions (repo convention).
 */
import { describe, test, expect } from 'bun:test'
import {
  slashQueryAt,
  applySlashSelection,
  filterSlashCommands,
  isSlashRuntime,
  type SlashCommand,
} from '../slashCommands'

const cmds: SlashCommand[] = [
  { name: '/clear', desc: '清除对话历史', source: 'builtin', kind: 'builtin' },
  { name: '/compact', desc: '压缩上下文', source: 'builtin', kind: 'builtin' },
  { name: '/deploy', desc: '部署到生产', source: 'project', kind: 'command' },
  { name: '/review', desc: '审查代码变更', source: 'builtin', kind: 'builtin' },
]

describe('slashQueryAt', () => {
  test('opens at line start', () => {
    expect(slashQueryAt('/cl', 3)).toBe('cl')
  })
  test('opens after whitespace', () => {
    expect(slashQueryAt('hello /dep', 10)).toBe('dep')
  })
  test('bare slash → empty query (menu shows all)', () => {
    expect(slashQueryAt('foo /', 5)).toBe('')
  })
  test('mid-word slash does NOT open', () => {
    expect(slashQueryAt('foo/bar', 7)).toBeNull()
  })
  test('URL does NOT open the menu', () => {
    expect(slashQueryAt('see http://x', 12)).toBeNull()
  })
  test('caret before the token → closed', () => {
    expect(slashQueryAt('/clear extra', 12)).toBeNull()
  })
})

describe('filterSlashCommands', () => {
  test('empty query returns all (copy, not alias)', () => {
    const out = filterSlashCommands(cmds, '')
    expect(out.length).toBe(cmds.length)
    expect(out).not.toBe(cmds)
  })
  test('prefix match ranks before substring', () => {
    // 'c' prefixes /clear and /compact; matches nothing else by name.
    const out = filterSlashCommands(cmds, 'c')
    expect(out.map((c) => c.name)).toEqual(['/clear', '/compact'])
  })
  test('matches description when name misses', () => {
    const out = filterSlashCommands(cmds, '生产')
    expect(out.map((c) => c.name)).toEqual(['/deploy'])
  })
  test('case-insensitive', () => {
    expect(filterSlashCommands(cmds, 'REV').map((c) => c.name)).toEqual(['/review'])
  })
  test('no match → empty', () => {
    expect(filterSlashCommands(cmds, 'zzz')).toEqual([])
  })
})

describe('applySlashSelection', () => {
  test('replaces the token and appends a space', () => {
    const r = applySlashSelection('/cl', 3, '/clear')
    expect(r.text).toBe('/clear ')
    expect(r.caret).toBe(7)
  })
  test('preserves text after the caret', () => {
    const r = applySlashSelection('/dep rest', 4, '/deploy')
    expect(r.text).toBe('/deploy  rest')
    expect(r.caret).toBe(8)
  })
  test('replaces a token after leading prose', () => {
    const r = applySlashSelection('hi /rev', 7, '/review')
    expect(r.text).toBe('hi /review ')
    expect(r.caret).toBe(11)
  })
  test('no active token → no-op', () => {
    const r = applySlashSelection('nothing here', 12, '/clear')
    expect(r.text).toBe('nothing here')
    expect(r.caret).toBe(12)
  })
})

describe('isSlashRuntime', () => {
  test('claude/codex mount, others do not', () => {
    expect(isSlashRuntime('claude')).toBe(true)
    expect(isSlashRuntime('codex')).toBe(true)
    expect(isSlashRuntime('deepwork')).toBe(false)
    expect(isSlashRuntime('')).toBe(false)
    expect(isSlashRuntime(null)).toBe(false)
    expect(isSlashRuntime(undefined)).toBe(false)
  })
})
