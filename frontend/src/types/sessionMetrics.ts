/**
 * sessionMetrics — host-agnostic contract for the shared single-session overview
 * (CHG-016 / SSOT). This is the data bag consumed by
 * @ce/components/overview/SessionOverviewPane.vue.
 *
 * Field set ported from pro's OverviewPanel.vue (lines ~115–145), kept in
 * snake_case to match the wire JSON 1:1 — pro's OverviewPanel already binds
 * snake_case fields, so there is NO mapping layer between endpoint and pane.
 *
 * Honesty contract (the load-bearing invariant): every accumulable metric is
 * `number | null | undefined`. `null`/`undefined` = "this column was never
 * reported" → the pane renders「—」(honest unknown), it does NOT fabricate 0.
 * `0` is a real, reported zero. Optional+nullable is therefore deliberate on
 * total_cost / currency / agent_calls / model_calls / permission_requests /
 * tool_calls_by_category — hosts that don't persist these omit them.
 */

/** One turn of the transcript (mirrors pro OverviewTurn — the per-turn usage row). */
export interface Turn {
  turn_number?: number
  duration_ms?: number | null
  ttft_ms?: number | null
  input_tokens?: number | null
  output_tokens?: number | null
  cache_read_tokens?: number | null
  cache_create_tokens?: number | null
  tool_calls?: number | null
  agent_calls?: number | null
  /** 真·Model TPS 的分母: 纯生成窗口 (首 token→末 token), 后端 proxy 实测落库。 */
  output_window_ms?: number | null
  tool_errors?: number | null
  model_calls?: number | null
  permission_requests?: number | null
  tool_calls_by_category?: Record<string, number> | null
  user_input?: string
  status?: string
}

/**
 * Session-level aggregate (the endpoint's `summary` segment). Each accumulable
 * field nil = no turn carried it → pane renders「—」(honest).
 */
export interface TurnsSummary {
  user_prompts?: number
  turn_count?: number
  started_at?: string | null
  total_duration_ms?: number | null
  input_tokens?: number | null
  output_tokens?: number | null
  cache_read_tokens?: number | null
  cache_create_tokens?: number | null
  tool_calls?: number | null
  /** Σ 纯生成窗口 ms; 配 output_tokens 给真·Model TPS。无 → null →「—」。 */
  output_window_ms?: number | null
  // 以下为可选+可空: 不持久化这些列的宿主直接省略 (→「—」)。
  tool_errors?: number | null
  model_calls?: number | null
  agent_calls?: number | null
  permission_requests?: number | null
  tool_calls_by_category?: Record<string, number> | null
  total_cost?: number | null
  currency?: string | null
}

/**
 * Reference UNIT price of the current session model, in currency per MILLION
 * tokens (the endpoint's top-level `price` segment, looked up from the kit/pricing
 * SSOT base Tier). `cache_write_5m` / `cache_write_1h` are 0 for providers without a
 * cache-write tier (OpenAI, Gemini). `context_threshold` is the long-context premium
 * boundary in tokens (0/omitted = none). The whole object is omitted/null when the
 * model is unknown to the price table → the pane renders「—」(honest), never a 0.
 */
export interface UnitPrice {
  input: number
  output: number
  cache_read: number
  cache_write_5m: number
  cache_write_1h: number
  currency: string
  context_threshold?: number
}

/**
 * Session detail (the endpoint's `detail` segment). `id` is `string | number`:
 * terminal session ids are uuids, pro's are numeric — both are valid.
 */
export interface SessionDetail {
  id: string | number
  title?: string
  summary?: string
  active?: boolean
  turn_count?: number
  model_id?: string
  created_at?: string
  updated_at?: string
  ended_at?: string | null
}

/** The full data bag the overview endpoint returns / the pane consumes. */
export interface SessionMetricsBag {
  detail: SessionDetail | null
  summary: TurnsSummary | null
  turns?: Turn[]
  /** 当前模型标定单价 (per-MTok)。无价/未知模型 → null/omit →「—」(诚实)。 */
  price?: UnitPrice | null
}
