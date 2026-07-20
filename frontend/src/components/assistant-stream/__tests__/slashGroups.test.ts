/**
 * groupSlashCommands — the menu's section split + per-section cap.
 *
 * The invariant worth a test is the one that would otherwise rot silently: `groups`
 * (what renders) and `flat` (what ↑↓ walks) come out of ONE pass, so a row hidden by
 * the cap is unreachable by keyboard for free. If someone later re-derives `flat` from
 * the unfiltered list, the menu keeps LOOKING right while the highlight walks into
 * rows nobody can see — the exact class of bug that has no visible symptom until a
 * user presses ↓ six times.
 */
import { describe, test, expect } from 'bun:test'
import { groupSlashCommands, SLASH_GROUP_CAP, type SlashCommand } from '../slashCommands'

function skill(n: string): SlashCommand {
  return { name: `/${n}`, desc: `${n} 描述`, source: 'user', kind: 'skill' }
}
function cmd(n: string, kind: 'builtin' | 'command' = 'command'): SlashCommand {
  return { name: `/${n}`, desc: `${n} 描述`, source: kind === 'builtin' ? 'builtin' : 'user', kind }
}

const many = [
  ...Array.from({ length: 8 }, (_, i) => skill(`sk${i}`)),
  ...Array.from({ length: 7 }, (_, i) => cmd(`cm${i}`)),
]

describe('sections', () => {
  test('splits by kind, skills first', () => {
    const { groups } = groupSlashCommands([cmd('clear', 'builtin'), skill('design')])
    expect(groups.map((g) => g.key)).toEqual(['skill', 'command'])
    expect(groups.map((g) => g.label)).toEqual(['技能', '命令'])
  })

  test('builtin folds into 命令 — origin is `source`, not a third section', () => {
    const { groups } = groupSlashCommands([cmd('clear', 'builtin'), cmd('deploy')])
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('command')
    expect(groups[0].items.map((c) => c.name)).toEqual(['/clear', '/deploy'])
  })

  test('empty sections are dropped, not rendered as empty headers', () => {
    const { groups } = groupSlashCommands([skill('design')])
    expect(groups.map((g) => g.key)).toEqual(['skill'])
  })

  test('server order is preserved inside a section', () => {
    const { groups } = groupSlashCommands([cmd('zeta', 'builtin'), cmd('alpha')])
    expect(groups[0].items.map((c) => c.name)).toEqual(['/zeta', '/alpha'])
  })
})

describe('cap', () => {
  test('caps each section independently and reports the true total', () => {
    const { groups } = groupSlashCommands(many)
    expect(groups[0].items).toHaveLength(SLASH_GROUP_CAP)
    expect(groups[0].total).toBe(8) // "显示全部 8 个技能" must name the real count
    expect(groups[1].items).toHaveLength(SLASH_GROUP_CAP)
    expect(groups[1].total).toBe(7)
  })

  test('expanding one section leaves the other capped', () => {
    const { groups } = groupSlashCommands(many, { expanded: new Set(['skill']) })
    expect(groups[0].items).toHaveLength(8)
    expect(groups[1].items).toHaveLength(SLASH_GROUP_CAP)
  })

  test('Infinity cap (a non-empty query) shows everything', () => {
    const { groups } = groupSlashCommands(many, { cap: Number.POSITIVE_INFINITY })
    expect(groups[0].items).toHaveLength(8)
    expect(groups[1].items).toHaveLength(7)
  })
})

describe('groups/flat are one source', () => {
  // The load-bearing test. flat MUST equal the concatenation of what renders — no more
  // (keyboard would walk invisible rows), no less (a visible row would be unselectable).
  test('flat === concat(groups.items), capped', () => {
    const { groups, flat } = groupSlashCommands(many)
    expect(flat).toEqual(groups.flatMap((g) => g.items))
    expect(flat).toHaveLength(SLASH_GROUP_CAP * 2)
  })

  test('flat === concat(groups.items), expanded', () => {
    const { groups, flat } = groupSlashCommands(many, { expanded: new Set(['skill', 'command']) })
    expect(flat).toEqual(groups.flatMap((g) => g.items))
    expect(flat).toHaveLength(15)
  })

  test('offset addresses the right row in flat — this is what @select emits', () => {
    const { groups, flat } = groupSlashCommands(many)
    for (const g of groups) {
      g.items.forEach((item, i) => {
        expect(flat[g.offset + i]).toBe(item)
      })
    }
    // 命令 section starts right after the capped 技能 section, NOT after all 8 skills.
    expect(groups[1].offset).toBe(SLASH_GROUP_CAP)
  })

  test('capped rows are absent from flat — ↑↓ cannot reach what is not on screen', () => {
    const { flat } = groupSlashCommands(many)
    expect(flat.map((c) => c.name)).not.toContain('/sk7')
    expect(flat.map((c) => c.name)).not.toContain('/cm6')
  })

  test('empty input yields an empty view, not a phantom section', () => {
    expect(groupSlashCommands([])).toEqual({ groups: [], flat: [] })
  })
})
