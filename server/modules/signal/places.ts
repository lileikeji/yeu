/**
 * 把热点事件挂到地图点位上。
 *
 * 匹配「标题/摘要里出现了某个已发布地点名或其别名」：
 * - 名称至少 3 个字，「楼」「馆」这类单字不进索引，否则会命中一切；
 * - 长名优先（「新区图书馆」先于「图书馆」），命中后在同一段文字里不再重复占位；
 * - 别名来自 knowledge_entities（entityType='place'，按标准名对齐），命中别名
 *   返回标准 { name, slug }；没有实体行的点位行为与无别名时完全一致；
 * - 只认已发布点位（status='published'），草稿点位不往外露。
 *
 * 不猜：没有命中就是空数组，调用方不要拿分类或栏目去兜底。
 */
import { and, eq } from 'drizzle-orm'
import { knowledgeEntities, places } from '../../database/schema'
import type { DatabaseClient } from '../../database/client'

export interface SignalPlaceTag {
  name: string
  slug: string
}

interface PlaceIndexEntry {
  name: string
  slug: string
  /** 标准名 + 全部合格别名；命中任一都归到这个点位。缺省时只按标准名匹配。 */
  matchNames?: string[]
}

/** 太泛的词不进索引：它们出现在几乎所有通知里，挂上去等于没挂。 */
const GENERIC_NAMES = new Set(['教学楼', '宿舍楼', '实验楼', '食堂', '操场', '图书馆'])

const MIN_NAME_LENGTH = 3

function usableAlias(alias: string): boolean {
  const trimmed = alias.trim()
  return trimmed.length >= MIN_NAME_LENGTH && !GENERIC_NAMES.has(trimmed)
}

function longestName(entry: PlaceIndexEntry): number {
  return entry.matchNames?.length
    ? Math.max(...entry.matchNames.map(aliasName => aliasName.length))
    : entry.name.length
}

function loadAliasMap(client: DatabaseClient): Map<string, string[]> {
  const rows = client.db.select({
    canonicalName: knowledgeEntities.canonicalName,
    aliasesJson: knowledgeEntities.aliasesJson
  })
    .from(knowledgeEntities)
    .where(and(eq(knowledgeEntities.entityType, 'place'), eq(knowledgeEntities.status, 'active')))
    .all()
  const map = new Map<string, string[]>()
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.aliasesJson)
      if (Array.isArray(parsed)) {
        const aliases = parsed.filter((item): item is string => typeof item === 'string' && usableAlias(item))
        if (aliases.length) map.set(row.canonicalName, aliases)
      }
    } catch {
      // aliases_json 不是合法 JSON 的实体行跳过，不影响其它实体
    }
  }
  return map
}

export function loadPlaceIndex(client: DatabaseClient): PlaceIndexEntry[] {
  const rows = client.db.select({ name: places.name, slug: places.slug })
    .from(places)
    .where(eq(places.status, 'published'))
    .all()
  const aliasMap = loadAliasMap(client)
  const seen = new Set<string>()
  const index: PlaceIndexEntry[] = []
  for (const row of rows) {
    const name = (row.name ?? '').trim()
    if (name.length < MIN_NAME_LENGTH || GENERIC_NAMES.has(name)) continue
    if (seen.has(name)) continue
    seen.add(name)
    const aliases = aliasMap.get(name) ?? []
    index.push({ name, slug: row.slug, matchNames: [name, ...aliases] })
  }
  // 长名优先，避免「图书馆」先把「新区图书馆」的位置占掉；别名与标准名一起参与排序。
  return [...index].sort((left, right) => longestName(right) - longestName(left))
}

export function matchPlaceTags(text: string, index: PlaceIndexEntry[], limit = 3): SignalPlaceTag[] {
  const haystack = (text ?? '').trim()
  if (!haystack || index.length === 0) return []
  const tags: SignalPlaceTag[] = []
  let rest = haystack
  // 长名优先在此保证（不依赖调用方传序）：「新区图书馆」先于「图书馆」占位。
  const ordered = [...index].sort((left, right) =>
    longestName(right) - longestName(left))
  for (const entry of ordered) {
    if (tags.length >= limit) break
    const names = entry.matchNames?.length ? entry.matchNames : [entry.name]
    let at = -1
    let matched = ''
    for (const aliasName of names) {
      at = rest.indexOf(aliasName)
      if (at >= 0) {
        matched = aliasName
        break
      }
    }
    if (at < 0) continue
    tags.push({ name: entry.name, slug: entry.slug })
    // 抹掉已命中的片段，防止「图书馆」再匹配到「新区图书馆」内部。
    rest = `${rest.slice(0, at)} ${'·'.repeat(matched.length)} ${rest.slice(at + matched.length)}`
  }
  return tags
}

/** 事件正文 = 代表条目的标题 + 摘要 + 同组其它条目标题，够用来匹配地名。 */
export function eventMatchText(title: string, summary: string, extraTitles: string[] = []): string {
  return [title, summary, ...extraTitles].filter(Boolean).join('\n')
}

export interface EventDateHint {
  kind: 'upcoming'
  /** ISO 日期（YYYY-MM-DD），解析出的最近一个未来活动日期。 */
  date: string
}

const EVENT_DATE_RE = /(?:(\d{4})\s*年)?\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/

/**
 * 从事件标题/摘要里尽力解析「预告日期」：只认「X月X日」字样，取最近一个
 * 未来日期；缺年份按 anchorMs 所在年补全。解析不出、日期非法或按锚点年
 * 解析已过去时返回 null——不猜次年、不硬造「进行中」，宁漏标不误标。
 */
export function parseEventDateHint(title: string, summary: string, anchorMs: number): EventDateHint | null {
  const haystack = [title, summary].filter(Boolean).join('\n')
  if (!haystack) return null
  const anchor = new Date(anchorMs)
  if (Number.isNaN(anchor.getTime())) return null
  const todayStart = new Date(new Date().toDateString()).getTime()
  const candidates: number[] = []
  for (const match of haystack.matchAll(new RegExp(EVENT_DATE_RE.source, 'g'))) {
    const [, rawYear, rawMonth, rawDay] = match
    const month = Number(rawMonth)
    const day = Number(rawDay)
    if (!month || month > 12 || !day || day > 31) continue
    const year = rawYear ? Number(rawYear) : anchor.getFullYear()
    const time = new Date(year, month - 1, day).getTime()
    if (!Number.isNaN(time)) candidates.push(time)
  }
  const upcoming = candidates
    .filter(time => time >= todayStart)
    .sort((left, right) => left - right)[0]
  if (upcoming === undefined) return null
  const date = new Date(upcoming)
  return {
    kind: 'upcoming',
    date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
}
