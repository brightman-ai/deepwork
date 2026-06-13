# V6 流习语层 — 组件 ↔ 原型 ↔ props 契约 (CHG-014 D2/D6)

> 纯 chrome，零业务装配。原型真源: `deepwork-pro/docs/changes/CHG-013-ux-v6-landing/refs/deepwork-v6.html`。
> 全部令牌走 `css/tokens.css` (--dw-*)，禁写死色值。装配在 pro 侧 (公私边界)。
> 出口: `blocks/index.ts` · `primitives/index.ts` · `assistant-stream/index.ts` (barrel)。

## A. 重塑既有块 (blocks/，经 blockRegistry 渲染，type 不变)

| 组件 | type | 原型行 | 关键 props / emit |
|------|------|--------|-------------------|
| ThinkingBlock | `thinking` | 1090 sbl.think | block{content,runtime?,startedAt?} + streaming?；卷收(本地 open) |
| ToolGroupBlock | `tool-group` | 1094-1101 xpill | block{tools[]}；family→chip(ch-read/bash/edit/write/agent)+bpath；卷收 |
| TaskPlanBlock | `task-plan` | 1305-1310 todoc | block{tasks[]}；✓done/◐prog/○pend + 进行中标注 |
| PermissionBlock | `permission`/`approval` | 1111 appr | block{content,effectClass?} + waited?/alwaysLabel?；emit allow-once/allow-always/deny |
| UsageFooter | (footer) | 1107 rmeta | message{usage{ttft_ms?,cache_read_tokens?,...},runtime?,elapsed_ms?} + streaming?；缺数据显「—」；emit copy/retry/project/branch |

## B. 新增块 (blocks/，注册为 core)

| 组件 | type | 原型行 | props / emit |
|------|------|--------|--------------|
| StripBlock | `strip` | 1088 | block{steps,summary,duration?,range?}；emit expand |
| LiveHead | `live-head` | 1113/1327 | block{command?,note?,elapsed?} |
| ArtifactCard | `artifact` | 1301 | block{name,version?,landed?,done?,streaming?}；emit open/export(streaming 期禁) |
| QBanner | `qbanner` | 1298/1326 | block{text,answered?,count?}；emit goto(未答才可点) |
| DiffBlock | `diff` | 1103/1223 | block{path,lines[{kind add/del/ctx,lno?,text}]}；自算 +N −M |
| UserBubble | (非注册) | 997 msg-u | content,round?,current?,total?,edited?；emit nav(±1)；右对齐 sf3 泡 + rnd chip |
| FileRefChip | (primitives) | 1093/1106 | path,line?；emit open；蓝 fref + ln |

## C. RoundNav 一组件两密度 (primitives/RoundNav.vue)

| density | 原型行 | 渲染 | props | emit |
|---------|--------|------|-------|------|
| `hover` | 985-989 | 右缘刻度 rn/i + hover 浮窗(rndchip #N+rpt 摘要+rpm ↓↑·耗时)，cur 琥珀 | rounds[]{index,title,engine?,inTokens?,outTokens?,duration?,current?} | goto(index) |
| `persistent` | 915-919 tline | 起止 td 标签 + tk2 刻度 (hover/focus 显 #N+作者摘要浮窗 v6-tkp; visited 灰化) + tline-hd 拖拽手柄 + #cur/total + 回到上次位置 | rounds[]{...,visited?} + meta{startLabel?,endLabel?,current,total,lastReadIndex?} | goto(index)/seek(0-1) |

> 滚动联动: 装配方监听滚动后更新 rounds[].current / meta.current，组件被动渲染。

## D. 通用原语 (primitives/)

| 组件 | 原型行 | props / 用法 |
|------|--------|--------------|
| SegControl | 1063/1349 | v-model + options[{value,label}] + dense?(viewport 变体) |
| KpiRow | 1119-1126 | items[{value,label,tone?good,delta?}]；缺值传 '—' |
| HeatBar | .heatb | value(0-1，自动 clamp) → amber alpha 条 |
| StatusDot | .sd | state: busy(绿脉冲)/idle(灰)/wait(黄脉冲)/dead(红) |
| CliIcon | .cli-ic | engine: cc(C 琥珀)/cx(X 中性)/gm(G 蓝) |
| EnvChip | .envchip | label + warn?(琥珀边) + caret?；slot#lead；emit click |
| MselPop | 963-977 | columns[{heading,items[{value,label,hint?}],selected?}] + open；emit pick(col,value)；三列弹窗壳 |
| ComposerShell | 1021-1037 | v-model + placeholder?/disabled?/canSend?；slot#mention #envrow；emit send；amber 圆发送 + cmp-bar |
| DockBar | 1263-1279 | tabs[{id,label,state,unread?}] + hint?；slot=body(xterm)；dock-h 折叠 + dock-tab(StatusDot) |

## E. 令牌映射 (原型 → tokens.css)

`--ac/-d`→`--dw-ac/-dim` · `--sf/sf2/sf3`→`--dw-sf*` · `--bd`→`--dw-bd` · `--mu`→`--dw-mu` ·
`--ok/blu/warn/red/pur`→`--dw-*` · `--r/r2/r3`→`--dw-r*` · `--mono/font`→`--dw-mono/font`。
一次性 alpha 字面量 (如 `oklch(74% 0.12 62/.4)`=warn) 保留为 inline (tokens.css 无对应 alpha 变量)。

## F. types.ts 扩展

- `AssistantUsageInfo`: +`ttft_ms?` +`cache_read_tokens?` (D5① 真数据，缺则「—」)
- 新 block union: strip/approval/live-head/artifact/qbanner/diff + AssistantFileRef/DiffLine
- `AssistantRoundItem` / `AssistantTimelineMeta` (RoundNav 数据 ← D5① turns)
