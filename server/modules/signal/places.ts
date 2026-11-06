/**
 * 把热点事件挂到地图点位上。
 *
 * 只做「标题/摘要里出现了某个已发布地点名」这一种匹配：
 * - 名称至少 3 个字，「楼」「馆」这类单字不进索引，否则会命中一切；
 * - 长名优先（「新区图书馆」先于「图书馆」），命中后在同一段文字里不再重复占位；
 * - 只认已发布点位（status='published'），草稿点位不往外露。
 *
 * 不猜：没有命中就是空数组，调用方不要拿分类或栏目去兜底。
 */
import { eq } from 'drizzle-orm'
import { places } from '../../database/schema'
import type { DatabaseClient } from '../../database/client'

export interface SignalPlaceTag {
  name: string
  slug: string
}

/** 太泛的词不进索引：它们出现在几乎所有通知里，挂上去等于没挂。 */
const GENERIC_NAMES = new Set(['教学楼', '宿舍楼', '实验楼', '食堂', '操场', '图书馆'])

const MIN_NAME_LENGTH = 3

export function loadPlaceIndex(client: DatabaseClient): SignalPlaceTag[] {
  const rows = client.db.select({ name: places.name, slug: places.slug })
    .from(places)
    .where(eq(places.status, 'published'))
    .all()
  const seen = new Set<string>()
  const index: SignalPlaceTag[] = []
  for (const row of rows) {
    const name = (row.name ?? '').trim()
    if (name.length < MIN_NAME_LENGTH || GENERIC_NAMES.has(name)) continue
    if (seen.has(name)) continue
    seen.add(name)
    index.push({ name, slug: row.slug })
  }
  // 长名优先，避免「图书馆」先把「新区图书馆」的位置占掉。
  return index.sort((left, right) => right.name.length - left.name.length)
}

export function matchPlaceTags(text: string, index: SignalPlaceTag[], limit = 3): SignalPlaceTag[] {
  const haystack = (text ?? '').trim()
  if (!haystack || index.length === 0) return []
  const tags: SignalPlaceTag[] = []
  let rest = haystack
  for (const item of index) {
    if (tags.length >= limit) break
    const at = rest.indexOf(item.name)
    if (at < 0) continue
    tags.push(item)
    // 抹掉已命中的片段，防止「图书馆」再匹配到「新区图书馆」内部。
    rest = `${rest.slice(0, at)} ${'·'.repeat(item.name.length)} ${rest.slice(at + item.name.length)}`
  }
  return tags
}

/** 事件正文 = 代表条目的标题 + 摘要 + 同组其它条目标题，够用来匹配地名。 */
export function eventMatchText(title: string, summary: string, extraTitles: string[] = []): string {
  return [title, summary, ...extraTitles].filter(Boolean).join('\n')
}
