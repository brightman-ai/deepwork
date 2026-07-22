// parseImageRefs — ws-ux-pro 诉求 E(点击放大)/G2(已发消息内图片预览): 从一条已发送的
// 用户消息文本里抽取图片引用路径，供 UserBubble 渲染缩略图 + ImageLightbox。
//
// 识别两类引用（ws composer 的 useWsAttachments.injectionText() 注入
// `[图片] @<rel_path> (用户提供的截图,请查看)` 这一行；用户也可能不带该 marker、直接把
// 一个图片路径打进正文，如 "图片1如下: @tmp/x.png 说明"——两种都要认得出来）：
//   ①  `[图片] @<path>` — marker 显式声明"这是图"，信任 marker 本身，不额外要求扩展名
//       （即便未来上传格式变化产出一个非常规扩展名，marker 仍然兜底）。
//   ②  裸 `@<path>`      — 没有 marker 时必须以图片扩展名结尾才算数(.png/.jpg/.jpeg/.gif/
//       .webp，大小写不敏感)，否则 `@某人`/`@some/note.txt` 这类纯提及或非图路径不会被
//       误判成图片。
//
// 纯函数、零副作用（不碰 DOM/网络）——可独立单测，同 repo 惯例（runSplit.ts /
// slashCommands.ts / types.ts 的 isThinkingWithheld，均是"组件把决策委托给一个可单测的
// 纯函数，模板只消费它的输出"）。
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp)$/i

// "@path" 的路径体贪婪地吃到下一个空白/@为止，但要在遇到这些标点时提前止步——中文场景下
// "路径后紧跟标点+更多文字、中间没有空格"（如 "@a.png，另外几个字"）否则会把标点后面的
// 字也一起吞进路径：既污染了路径本身，也会让本该去重的同一路径长出好几个不同的"变体"。
// 故意不排除 "."：文件扩展名 / 相对路径前缀("../"、".dw-uploads/…") 都要靠它。
const PATH_TOKEN_RE = /(\[图片\]\s*)?@([^\s@,!?;:，。！？；：、)）\]】》」』"'`]+)/g

// 兜底二次裁剪：路径体恰好以 "." 收尾、后面又紧跟一个真落在整个 token 末尾的句子结束符
// 时（英文语境 "@shot.png." 那种整句话到此为止），上面的字符类允许 "." 留在路径里，这里
// 再摘掉这类游离在真正末尾的标点。
const TRAILING_PUNCT_RE = /[,.!?;:，。！？；：、)）\]】》」』"'`]+$/

/**
 * 从一段文本里抽取全部图片引用路径，按首次出现顺序去重返回。
 */
export function parseImageRefs(content: string): string[] {
  if (!content) return []
  const seen = new Set<string>()
  const result: string[] = []
  // PATH_TOKEN_RE 是模块级共享的 g 正则——正常情况下每次调用都会自然跑到 exec 返回 null
  // 才退出循环(此时 lastIndex 已被 JS 引擎自动归零)，这里显式归零只是防御性的：不依赖
  // "上一次调用一定跑完了整个循环"这个隐含前提。
  PATH_TOKEN_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = PATH_TOKEN_RE.exec(content))) {
    const hasMarker = !!m[1]
    const token = m[2].replace(TRAILING_PUNCT_RE, '')
    if (!token) continue
    if (!hasMarker && !IMAGE_EXT_RE.test(token)) continue
    if (seen.has(token)) continue
    seen.add(token)
    result.push(token)
  }
  return result
}

export interface BubbleImageRef {
  /** 抽出的原始引用路径（解析成 URL 之前，如 rel_path）。 */
  path: string
  /** resolveAttachmentUrl(path) 解析出的可访问 URL。 */
  url: string
}

/**
 * UserBubble 用来决定"这条消息该显示哪些缩略图"的完整推导：parseImageRefs 抽路径 →
 * 逐个交给消费点注入的 resolveAttachmentUrl 解析成 URL → 丢弃解析不出的(null/undefined)。
 * 抽成纯函数是为了不用挂载真实组件也能单测这条推导链（同 repo UsageFooter.vue ↔
 * isThinkingWithheld 的先例：组件里只留一行 computed 转调它）。
 *
 * resolveAttachmentUrl 未传（undefined）时直接返回空数组——未接线的消费点（chat/od 等）
 * 保持"纯文本、零回归"，是 UserBubble 新增这个 prop 之后逐像素不变的关键契约点。
 */
export function resolveBubbleImages(
  content: string,
  resolveAttachmentUrl?: (path: string) => string | null,
): BubbleImageRef[] {
  if (!resolveAttachmentUrl) return []
  const out: BubbleImageRef[] = []
  for (const path of parseImageRefs(content)) {
    const url = resolveAttachmentUrl(path)
    if (url) out.push({ path, url })
  }
  return out
}
