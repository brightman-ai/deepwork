// slashCommands.ts — pure, DOM-free helpers for the composer's "/" completion menu.
//
// The hard performance red line is ZERO per-keystroke backend round-trips: the full
// command set is prefetched once per (runtime, workspace) into a composable cache
// (see useSlashCommands.ts) and every keystroke filters that array PURELY here. This
// module is intentionally side-effect-free so the filter/parse logic is unit-testable
// without a DOM or network (bun:test).

/** One completion entry, mirroring the backend GET /api/cli/commands shape. */
export interface SlashCommand {
  name: string // includes the leading slash, e.g. "/clear"
  desc: string
  source: 'builtin' | 'user' | 'project' // origin — drives the badge
  kind: 'builtin' | 'command' | 'skill' // type
}

/** CLI runtimes that expose a slash-command menu. Native runtimes never mount it. */
export const SLASH_RUNTIMES = new Set(['claude', 'codex'])

/** One rendered section of the menu. `kind` decides the section; `source` stays a
 *  per-row detail (origin), so the two backend fields never overlap in meaning. */
export interface SlashGroup {
  key: 'skill' | 'command'
  label: string
  /** Matches in this section BEFORE the cap — what "显示全部 N 个" counts. */
  total: number
  /** Rows actually rendered (== total once expanded). */
  items: SlashCommand[]
  /** Index in `SlashView.flat` where `items[0]` sits. Rows map to flat indices as
   *  `offset + i`, which is what keyboard nav and selection both address. */
  offset: number
}

/** The menu's whole render+navigation state, produced in ONE pass so the sections and
 *  the keyboard sequence can never disagree (a capped row is absent from BOTH). */
export interface SlashView {
  groups: SlashGroup[]
  flat: SlashCommand[]
}

/** Rows shown per section before "显示全部". Only bites on an empty query — with a
 *  real 74-command home dir, a bare "/" is otherwise an 86-row undifferentiated scroll. */
export const SLASH_GROUP_CAP = 5

// Sections in render order. Skills first: a skill is a capability ("I want to do X"),
// a command is an operation ("run Y") — capability reads as the higher-level intent.
// builtin folds into 命令 because the builtin/user split is ORIGIN, and origin is
// already carried by `source`; making it a third section would encode it twice.
const SLASH_SECTIONS: ReadonlyArray<{ key: SlashGroup['key']; label: string }> = [
  { key: 'skill', label: '技能' },
  { key: 'command', label: '命令' },
]

/**
 * groupSlashCommands splits an already-filtered list into rendered sections, applying
 * a per-section cap unless that section is expanded. Empty sections are dropped.
 *
 * Pure. Returns `flat` alongside `groups` on purpose: keyboard nav walks `flat`, so a
 * row hidden by the cap is unreachable by ↑↓ for free — no second "is it visible?"
 * predicate to keep in sync with the template.
 */
export function groupSlashCommands(
  commands: SlashCommand[],
  opts: { cap?: number; expanded?: ReadonlySet<string> } = {},
): SlashView {
  const cap = opts.cap ?? SLASH_GROUP_CAP
  const expanded = opts.expanded
  const groups: SlashGroup[] = []
  const flat: SlashCommand[] = []
  for (const section of SLASH_SECTIONS) {
    // 'builtin' and 'command' are both operations → one section (see note above).
    const all = commands.filter((c) =>
      section.key === 'skill' ? c.kind === 'skill' : c.kind !== 'skill',
    )
    if (!all.length) continue
    const items = expanded?.has(section.key) ? all : all.slice(0, cap)
    groups.push({ key: section.key, label: section.label, total: all.length, items, offset: flat.length })
    flat.push(...items)
  }
  return { groups, flat }
}

export function isSlashRuntime(runtime?: string | null): boolean {
  return !!runtime && SLASH_RUNTIMES.has(runtime)
}

// A slash token: "/" then any run of non-whitespace, non-slash chars (letters, digits,
// "-", ":" for namespaced commands like /git:commit). Anchored so the "/" must be at
// line start or right after whitespace — never mid-word or inside a path/URL ("http://").
const SLASH_TOKEN_RE = /(^|\s)\/([^\s/]*)$/

/**
 * slashQueryAt inspects the text BEFORE the caret and returns the active slash query
 * (the chars after "/", possibly ""), or null when the caret is not inside a slash
 * token. This is what decides whether the menu is open and what to filter by.
 */
export function slashQueryAt(text: string, caret: number): string | null {
  const before = text.slice(0, Math.max(0, caret))
  const m = SLASH_TOKEN_RE.exec(before)
  return m ? m[2] : null
}

/**
 * applySlashSelection replaces the active slash token immediately before the caret
 * with `commandName` + a trailing space, returning the new full text and caret index.
 * Pure — the caller applies it to the textarea. No-op (returns nulls) when there is no
 * active token, so it is safe to call unconditionally.
 */
export function applySlashSelection(
  text: string,
  caret: number,
  commandName: string,
): { text: string; caret: number } {
  const c = Math.max(0, Math.min(caret, text.length))
  const before = text.slice(0, c)
  const after = text.slice(c)
  if (!SLASH_TOKEN_RE.test(before)) return { text, caret }
  const replaced = before.replace(SLASH_TOKEN_RE, (_m, pre: string) => `${pre}${commandName} `)
  return { text: replaced + after, caret: replaced.length }
}

/**
 * filterSlashCommands does the per-keystroke local filtering. Case-insensitive; ranks
 * name-prefix > name-substring > description-substring; ties keep the server's order
 * (builtin → user → project, each grouped). Empty query returns the full list.
 */
export function filterSlashCommands(commands: SlashCommand[], query: string): SlashCommand[] {
  const q = query.trim().toLowerCase()
  if (!q) return commands.slice()
  const scored: Array<{ cmd: SlashCommand; rank: number; idx: number }> = []
  commands.forEach((cmd, idx) => {
    const name = cmd.name.replace(/^\//, '').toLowerCase()
    const desc = (cmd.desc || '').toLowerCase()
    let rank = -1
    if (name.startsWith(q)) rank = 0
    else if (name.includes(q)) rank = 1
    else if (desc.includes(q)) rank = 2
    if (rank >= 0) scored.push({ cmd, rank, idx })
  })
  scored.sort((a, b) => a.rank - b.rank || a.idx - b.idx)
  return scored.map((s) => s.cmd)
}
