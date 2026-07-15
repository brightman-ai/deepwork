// 连接态原语 (SSOT, @ce 共享): 一条实时连接 (WebSocket / SSE / …) 的健康度枚举。
// 语义与传输无关 —— 终端的双向 WS、workbench 的单向 SSE 都映射到这同一套状态, 由
// ConnectionChip 统一呈现 (绿点/黄脉冲/橙脉冲/红点)。
//
//   connecting   首次建立中 (还没连上过)
//   connected    已连通
//   reconnecting 断了正在自动重试 (曾连上过)
//   disconnected 断开且已放弃自动重试 (需要人工「刷新」重连 —— ConnectionChip 的 refresh 出口)
//   preempted    被抢占/被接管 (同一会话在别处被顶掉; SSE 场景通常用不到, 保留给 WS)
export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'preempted'
