/**
 * fuzzyMatch — gap-tolerant filter shared by every FilePanel search/filter box (SSOT).
 *
 * The query is split on whitespace into terms; a candidate matches when EVERY term is a
 * case-insensitive substring of it (order-independent). So "test iso" matches
 * "tmux-test-isolation". An empty / whitespace-only query matches everything. Each
 * consuming backend's recursive file search mirrors this rule so tree + touched behave
 * identically.
 */
export function fuzzyMatch(query: string, text: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const hay = text.toLowerCase()
  return terms.every((t) => hay.includes(t))
}
