// parseImageRefs / resolveBubbleImages — ws-ux-pro 诉求 E(点击放大)/G2(已发消息内图片
// 预览) 抽取逻辑测试。
//
// 覆盖: 多引用交错抽取、混合文本(图与非图共存、纯 @提及不误判)、marker 与裸 @path 两种
// 形态、重复引用去重、trailing 标点不污染路径、resolveBubbleImages 的"未接线=空数组
// （零回归）/ 单条解析失败不连累其它条"。
import { describe, test, expect } from 'bun:test'
import { parseImageRefs, resolveBubbleImages } from '../parseImageRefs'

describe('parseImageRefs', () => {
  test('单条 marker 引用（真实后端格式：useWsAttachments.injectionText 产出）', () => {
    expect(parseImageRefs('[图片] @.dw-uploads/1-a.png (用户提供的截图,请查看)'))
      .toEqual(['.dw-uploads/1-a.png'])
  })

  test('多引用：marker 与裸路径混合，按出现顺序抽取', () => {
    const text = '看这两张：[图片] @.dw-uploads/1-a.png (用户提供的截图,请查看)\n图片2如下: @tmp/clip/2-b.jpg 里面的问题'
    expect(parseImageRefs(text)).toEqual(['.dw-uploads/1-a.png', 'tmp/clip/2-b.jpg'])
  })

  test('混合文本：@提及/非图扩展名路径不误判，只认图片', () => {
    const text = '@张三 提到过 @notes.txt 和 @archive.tar.gz，只有 [图片] @shot.png 是图'
    expect(parseImageRefs(text)).toEqual(['shot.png'])
  })

  test('裸 @path 无图片扩展名 → 不算图片引用（即使看起来像一个路径）', () => {
    expect(parseImageRefs('看下 @docs/spec.md 里的定义')).toEqual([])
  })

  test('裸 @path 有图片扩展名（无 marker）→ 仍算图片引用（用户自己打的路径, B5 场景）', () => {
    expect(parseImageRefs('图片1如下:@tmp/clip/07-22-01/x.png 里面的问题xxx'))
      .toEqual(['tmp/clip/07-22-01/x.png'])
  })

  test('扩展名大小写不敏感', () => {
    expect(parseImageRefs('@shot.PNG 看一下')).toEqual(['shot.PNG'])
  })

  test('marker 存在但扩展名不在图片白名单 → 仍信任 marker（未来格式变化的兜底）', () => {
    expect(parseImageRefs('[图片] @weird-name-no-ext 请看')).toEqual(['weird-name-no-ext'])
  })

  test('重复引用去重（保留首次出现顺序）', () => {
    const text = '[图片] @a.png 说明一下 [图片] @a.png，另外 @a.png 也是它'
    expect(parseImageRefs(text)).toEqual(['a.png'])
  })

  test('紧跟中文标点(路径与标点之间无空格)不污染路径', () => {
    expect(parseImageRefs('看这张@a.png，效果不错')).toEqual(['a.png'])
  })

  test('空文本/无引用', () => {
    expect(parseImageRefs('')).toEqual([])
    expect(parseImageRefs('普通一句话，没有任何引用')).toEqual([])
  })
})

describe('resolveBubbleImages', () => {
  const content = '[图片] @a.png 与 @b.jpg 一起看，@notes.txt 不是图'

  test('未传 resolveAttachmentUrl → 空数组（未接线消费点零回归，如 chat/od）', () => {
    expect(resolveBubbleImages(content)).toEqual([])
    expect(resolveBubbleImages(content, undefined)).toEqual([])
  })

  test('全部路径都能解析 → 按抽取顺序返回 {path,url}', () => {
    const resolve = (p: string) => `/api/uploads/${encodeURIComponent(p)}`
    expect(resolveBubbleImages(content, resolve)).toEqual([
      { path: 'a.png', url: '/api/uploads/a.png' },
      { path: 'b.jpg', url: '/api/uploads/b.jpg' },
    ])
  })

  test('某条解析返回 null → 只丢弃这一条，不连累其它条（纯文本回退，而非报错）', () => {
    const resolve = (p: string) => (p === 'b.jpg' ? null : `/api/uploads/${p}`)
    expect(resolveBubbleImages(content, resolve)).toEqual([
      { path: 'a.png', url: '/api/uploads/a.png' },
    ])
  })

  test('全部解析返回 null → 空数组', () => {
    expect(resolveBubbleImages(content, () => null)).toEqual([])
  })
})
