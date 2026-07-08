// FilePanel SSOT — the data-source injection contract.
//
// ONE shared file panel for many hosts (e.g. a terminal drawer, a workspace WorkArea, a
// read-only share view). The component carries ZERO auth / endpoint knowledge; each host
// injects a FileSource backed by its own API. Differences are expressed through `caps` +
// the injected fetchers, never by forking the component.

/** One file/dir row. `touched_at` (unix ms) + `tool` are set only for touched entries. */
export interface FileEntry {
  name: string
  path: string // relative to the source root
  is_dir: boolean
  size: number
  touched_at?: number
  tool?: string
}

/** A file's content for preview. `encoding='base64'` carries images/binaries. */
export interface FileContent {
  path: string
  content: string
  size: number
  encoding: 'text' | 'base64'
  /** true when the source capped an oversized file (preview shows a download-only state). */
  truncated?: boolean
}

/** Recursive-search result with a best-effort truncation flag (large trees). */
export interface FileSearchResult {
  entries: FileEntry[]
  truncated: boolean
}

/** Which panel affordances this source supports. A false cap hides its UI entirely
 *  (honest: no dead controls). */
export interface FileSourceCaps {
  /** "涉及文件" — files the session transcript touched (listTouched). */
  touched: boolean
  /** directory browse (listDir). */
  browse: boolean
  /** recursive name search (search). */
  search: boolean
  /** authed blob download (download). */
  download: boolean
}

/** Durable session facts for the 总览 (SessionOverview) tab. Every field optional — a host
 *  passes what it knows; the UI omits the rest (honest, no "—" clutter). */
export interface SessionOverviewData {
  title?: string
  state?: string // '运行中' / '空闲' / '已结束'; omit for a read-only replay
  model?: string
  runtime?: string
  effort?: string
  turns?: number
  userInputs?: number
  startedAt?: string // ISO/RFC3339; elapsed derives from it when elapsedMs is absent
  elapsedMs?: number
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
}

/** The injected data source. All paths are source-root-relative; the backend clamps them
 *  to its jailed root — the component never sees absolute host paths. */
export interface FileSource {
  caps: FileSourceCaps
  /** Files the transcript touched, newest-first. Only called when caps.touched. */
  listTouched(): Promise<FileEntry[]>
  /** Directory listing at `rel` ('' = root). Only called when caps.browse. */
  listDir(rel: string): Promise<{ dir: string; entries: FileEntry[] }>
  /** File content for preview. */
  readFile(rel: string): Promise<FileContent>
  /** Authed blob for download. Only called when caps.download. */
  download(rel: string): Promise<Blob>
  /** Recursive fuzzy name search. Only called when caps.search. */
  search?(query: string): Promise<FileSearchResult>
}
