// RunStream density spectrum (CHG-013 D8): full ⊃ chat ⊃ compact — a single
// semantic source for the one AssistantStreamSurface base; density only controls
// visibility/sizing, never forks block rendering.
//   full    = WS / OD / CLI 全量主流
//   chat    = chat portal solo (单栏对话)
//   compact = 伴随边栏 (Browser / Topic companion)
export type AssistantDensity = 'full' | 'chat' | 'compact'

export type AssistantRole = 'user' | 'assistant' | 'system'

export interface AssistantRuntimeInfo {
  agent?: string
  model?: string
  effort?: string
}

export interface AssistantUsageInfo {
  input_tokens?: number
  thinking_tokens?: number
  output_tokens?: number
  cost_usd?: number
  estimated?: boolean
  // CHG-014 D5①: rmeta footer 真数据。无源字段一律可选 → 缺失时渲染「—」。
  ttft_ms?: number          // 首 token 时延 (仅运行时可得，△ 软标)
  cache_read_tokens?: number
  // 该轮实际使用的模型 id (SSOT: per-turn 实测值)。footer 优先读它，回落
  // message.runtime?.model (会话意图)。live 从事件 meta.model 取，replay 从
  // usage 块 / transcript meta 取 — 走同一 normalizeUsage，live≡replay 不漂移。
  model?: string
}

export interface AssistantToolEvent {
  id: string
  name: string
  input?: unknown
  output?: string
  is_error?: boolean
  duration_ms?: number
  // CHG-015 P8: tool lifecycle terminal flag. A `tool_result` frame means the tool
  // COMPLETED even when its textual output is empty/absent (backend omits empty
  // `output` via omitempty). Spinner termination must key off this, NOT `output`
  // presence — otherwise an empty-success tool spins forever. Set by the workstream
  // reducer on tool_result/skill_result and by history rebuild (always done).
  done?: boolean
}

export interface AssistantTaskItem {
  id?: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

// Extension block (CHG-013 D8): portals register domain-specific blocks via
// blockRegistry.registerExtension(kind, component). The surface renders them
// through the registry by passing the whole block as the `block` prop. This is
// the ONLY sanctioned way to add portal blocks — the base must never branch on
// `if (portal === 'od')`.
export interface AssistantExtensionBlock {
  type: string
  [key: string]: unknown
}

// CHG-014 D2: v6 流习语块。纯 chrome (零业务装配)，由 pro 侧填数据。
// 文件锚 (fref/diff 引用)
export interface AssistantFileRef {
  path: string
  line?: number
}

// strip 卷收条: 折叠的历史轮摘要
export interface AssistantStripBlock {
  type: 'strip'
  steps: number              // ✓N 步
  summary: string            // 「读 SOP · grep · 修复…」
  duration?: string          // 「3m12s」缺则省
  range?: string             // #a-#b 轮次范围
}

// CHG-014 S8 F1: 单一 permission/approval 契约。原 `approval` 独立 shape
// (tool/title/command/waited) 与注册到的 PermissionBlock (content/effectClass)
// 错位 → 会渲染 undefined 并丢命令。现合并为单一 `permission` 块（见 AssistantBlock
// union），承载全部审批字段。`approval` 类型作为废弃别名保留 type alias，禁止再注册。
// PermissionBlock 直接从 block 读取这些字段，三处 (types/registry/组件) 契约一致。
export interface AssistantPermissionBlock {
  type: 'permission'
  // 兼容字段（旧 permission 形态）：纯文本提示 + 效果分级标签
  content?: string           // 标题文本（缺则用 title）
  effectClass?: string       // 命令体/效果（缺则用 command）
  // appr 审批卡字段（原 approval shape，事件真存在才装配）
  tool?: string              // chip 文本，如 'Bash'
  title?: string             // 「删除临时检查点」← 标题首选
  command?: string           // appr-cmd 命令体 ← 命令首选
  waited?: string            // 「等待 12s」
  alwaysLabel?: string       // 「总是允许 rm（本项目）」缺则用默认
}
// 废弃别名：保留以免外部 import 断裂；新代码一律用 AssistantPermissionBlock。
export type AssistantApprovalBlock = AssistantPermissionBlock

// live-head 运行头: spin + 当前命令 + 计时
export interface AssistantLiveHeadBlock {
  type: 'live-head'
  command?: string           // 当前执行命令
  note?: string              // 「等审批后继续」
  elapsed?: string           // 「12.4s」
}

// artcard 产物卡 (OD)
export interface AssistantArtifactBlock {
  type: 'artifact'
  name: string               // 文件名
  version?: string           // v=mtime badge
  landed?: boolean           // 文件落盘
  done?: boolean             // ✓ 完成 (streaming 期禁导出)
  streaming?: boolean
}

// qbanner 问题横幅 (OD)
export interface AssistantQBannerBlock {
  type: 'qbanner'
  text: string
  answered?: boolean         // 已回答 → 灰；未答 → 琥珀可点
  count?: number
}

// diff 块: +N −M
export interface AssistantDiffLine {
  kind: 'add' | 'del' | 'ctx'
  lno?: number
  text: string
}
export interface AssistantDiffBlock {
  type: 'diff'
  path: string               // dh 头
  lines: AssistantDiffLine[]
}

// CHG-014 Runtime-SSOT P2: subagent 子流块。一个 `Agent` tool_use → 该 subagent
// 的独立执行子流。对照原型 ch-agent (行 1104): 琥珀 chip + subagent_type + description
// + 嵌套 inner blocks (children) 子流（不卷收，视觉缩进 + 左 amber 竖线表示子 agent
// 执行）。agent-team 场景 = 同一轮多个并列 AgentBlock，层级保真。children 可递归含
// 任意 AssistantBlock（含再嵌套的 agent），由 blockRegistry 同源渲染。
export interface AssistantAgentBlock {
  type: 'agent'
  subagentType?: string        // 派发的 agent 种类，如 Explore / general-purpose
  description?: string         // 人类可读任务描述
  prompt?: string              // 完整派发 prompt（hover/展开可见，可选）
  result?: string              // subagent 返回结果摘要（tool_result）
  isError?: boolean            // 子流失败
  children?: AssistantBlock[]  // 嵌套子流 blocks（subagent 内部执行；空 = 仅头部）
  // CHG-014 P3b (Gap-4): 该子 agent 的用量 / 耗时。durationMs = 端到端真实墙钟
  // (tool_use→tool_result 时间差, 后端推导)。inTokens/outTokens 仅当 runtime 内联
  // 子 agent 自身 usage 才有 —— claude 不内联 + sidechain 缺 → 缺则渲染「—」(不伪造)。
  durationMs?: number          // 子流总耗时 (ms, 真实)
  inTokens?: number            // ↓in (缺→「—」)
  outTokens?: number           // ↑out (缺→「—」)
}

// CHG-014 P3b (Gap-4): task-notification 楼层块 — 后台任务 / 派发 agent 完成的
// 运行时系统事件 (claude `<task-notification>` user 行, 真 schema 见 sessionsource)。
// 一等 block kind (扩展点: 未来更多系统事件块同范式)。紧凑单行卡 (图标 + 状态徽章 +
// 简述 + 右对齐 mono 时间), 复用 .ai-chip 视觉语汇, 不占满宽气泡。
export interface AssistantTaskNotificationBlock {
  type: 'task-notification'
  status?: 'completed' | 'failed' | 'killed' | (string & {})  // 通知状态
  summary?: string             // <summary> 简述
  taskId?: string              // runtime 任务 id (调试/round-trip)
  at?: string                  // ISO 时刻 (右对齐 mono)
}

export type AssistantBlock =
  | { type: 'text'; content: string }
  | { type: 'waiting'; status: string; startedAt?: number }
  // CHG-015 P3a: `endedAt` freezes the thinking duration at settle time (text starts
  // or turn done). Display elapsed = endedAt-startedAt (same 口径 as backend total),
  // never live wall-clock — otherwise thinking time keeps growing past total and
  // exceeds it (含等待空转). Absent endedAt + streaming → live wall-clock (still ticking).
  | { type: 'thinking'; content: string; startedAt?: number; endedAt?: number; streaming?: boolean; runtime?: AssistantRuntimeInfo; usage?: AssistantUsageInfo }
  | { type: 'tool-group'; tools: AssistantToolEvent[] }
  | { type: 'task-plan'; tasks: AssistantTaskItem[] }
  | AssistantPermissionBlock
  | { type: 'error'; message: string; retryable?: boolean }
  | AssistantStripBlock
  | AssistantLiveHeadBlock
  | AssistantArtifactBlock
  | AssistantQBannerBlock
  | AssistantDiffBlock
  | AssistantAgentBlock
  | AssistantTaskNotificationBlock
  | AssistantExtensionBlock

export interface AssistantMessage {
  id: string
  role: AssistantRole
  content?: string
  blocks?: AssistantBlock[]
  streaming?: boolean
  runtime?: AssistantRuntimeInfo
  usage?: AssistantUsageInfo
  live_usage?: AssistantUsageInfo
  elapsed_ms?: number
  started_at_ms?: number
  status?: 'normal' | 'failed'
  error?: string
  // CHG-014 S8 F10: 用户消息版本切换（编辑重发产生多版本）。仅当消费点接线
  // 且 userBubbleNav=true 时由 surface 透传给 UserBubble；缺失 → 不渲染 nav 钮（无死 UI）。
  versionIndex?: number       // 当前版本序号 (1-based)
  versionCount?: number       // 总版本数 (>1 才显示切换)
  // owner 对称 steer: 该用户气泡是"运行中插入本轮"的补充(useWorkstreamController.steer 乐观上屏)。
  // UserBubble 据此显「↩ 已插入本轮」意符, 与普通轮视觉区分(设计心理学: 可视清晰/事后可辨)。
  steered?: boolean
}

export interface AssistantLauncherItem {
  id: string
  label: string
  description?: string
  insertText: string
}

export interface AssistantContextItem {
  label: string
  value: string
  tone?: 'default' | 'muted' | 'warning' | 'good'
}

export interface AssistantStatusItem {
  label: string
  value: string | number
}

export interface AssistantSessionCreatedEvent {
  sessionId: number
}

// CHG-014 P4 (Gap-5): RoundNav 楼层作者 — AI/Human 区分头像。
// 单一数据源: role/author 进 AssistantRoundItem 契约, RoundNav 纯渲染 (装配方喂数据)。
// 扩展性: role 不限死 human/ai, 留 string 容未来多 agent/多用户角色;
// author.avatarKey → 头像色档 (av-1..5 / 哈希 seed); avatarUrl 优先 (真实头像图)。
export interface AssistantRoundAuthor {
  name: string               // 作者名 (浮窗加粗显示)
  // 头像色档: 'human' | 'ai' 语义键, 或 'av-1'..'av-5' 显式色, 或任意 seed (哈希成色)。
  // 缺省时 RoundNav 按 role 推断 (human→暖琥珀, ai→蓝)。
  avatarKey?: string
  avatarUrl?: string         // 真实头像图 URL (优先于字母仿头像)
  initial?: string           // 仿头像字母 (缺则取 name 首字, H=human/A=ai 兜底)
}
export interface AssistantRoundItem {
  index: number              // #N
  title: string              // 用户轮摘要
  engine?: string            // 引擎名
  inTokens?: number          // ↓in
  outTokens?: number         // ↑out
  duration?: string          // 「2.1s」
  current?: boolean          // cur 琥珀
  visited?: boolean          // persistent tline: 已读楼层灰化 (topic last-read 推进)
  // P4 (Gap-5): 该轮发起者角色 + 头像。'human'=人类发帖/提问, 'ai'=agent 回复;
  // 留 string 容多 agent/多用户。RoundNav hover/persistent 浮窗依此渲染仿头像区分。
  role?: 'human' | 'ai' | (string & {})
  author?: AssistantRoundAuthor
}

// persistent (tline) 密度的额外字段
export interface AssistantTimelineMeta {
  startLabel?: string        // 起始标签 (如 4月7日)
  endLabel?: string          // 结束标签 (如 35 分钟前)
  current: number            // #cur
  total: number              // total
  lastReadIndex?: number     // 「回到上次读到的位置」← topic_users.last_read
}
