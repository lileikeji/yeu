/**
 * 日报 / 周报 / 月报。
 *
 * 全部规则化，不调模型：排序看热度，分栏看分类，一句话结论由标题和来源数拼出来。
 * 同一天只出一份（signal_reports 上有 kind+period_key 唯一约束）；
 * 已经报过的事件，只有出现新动静（lastSeenAt 晚于上次成报时间）才再次跟进，
 * 否则日报会连着三天推荐同一条放假通知。
 */
import { SIGNAL_HOUR_MS, signalPeriodLabel } from './time'
import type { SignalReportKind } from './time'

export interface SignalReportEventInput {
  id: string
  slug: string
  title: string
  summary: string
  category: string
  heat: number
  sourceCount: number
  itemCount: number
  tier: string
  firstSeenAt: number
  lastSeenAt: number
}

export interface SignalReportItem {
  eventId: string
  slug: string
  title: string
  summary: string
  category: string
  heat: number
  sourceCount: number
  itemCount: number
  tier: string
  isNew: boolean
}

export interface SignalReportSection {
  key: string
  title: string
  items: SignalReportItem[]
}

export interface SignalReportPayload {
  kind: SignalReportKind
  periodKey: string
  label: string
  title: string
  generatedAt: number
  lead: SignalReportItem[]
  sections: SignalReportSection[]
  stats: {
    events: number
    newEvents: number
    sources: number
  }
}

/** 头条最多几条。 */
export const SIGNAL_REPORT_LEAD_LIMIT = 5
/** 分栏最多几栏、每栏最多几条。 */
export const SIGNAL_REPORT_SECTION_LIMIT = 8
export const SIGNAL_REPORT_SECTION_ITEM_LIMIT = 6
/** 两天之内重复报同一件事的概率很高，用指纹去重。 */
export const SIGNAL_REPORT_REPEAT_WINDOW_HOURS = 48

function fingerprint(title: string): string {
  return title.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}

function toReportItem(event: SignalReportEventInput, start: number): SignalReportItem {
  return {
    eventId: event.id,
    slug: event.slug,
    title: event.title,
    summary: event.summary,
    category: event.category,
    heat: event.heat,
    sourceCount: event.sourceCount,
    itemCount: event.itemCount,
    tier: event.tier,
    isNew: event.firstSeenAt >= start
  }
}

function compareByHeat(left: SignalReportEventInput, right: SignalReportEventInput): number {
  return right.heat - left.heat || right.lastSeenAt - left.lastSeenAt || right.sourceCount - left.sourceCount
}

/** 标题指纹去重，保留热度高的那条。 */
export function dedupeReportEvents(events: SignalReportEventInput[]): SignalReportEventInput[] {
  const sorted = [...events].sort(compareByHeat)
  const seen = new Set<string>()
  const kept: SignalReportEventInput[] = []
  for (const event of sorted) {
    const key = fingerprint(event.title)
    if (!key || seen.has(key)) continue
    seen.add(key)
    kept.push(event)
  }
  return kept
}

export interface BuildDailyReportInput {
  events: SignalReportEventInput[]
  periodKey: string
  generatedAt: number
  /** 事件 id → 上次成报时间。 */
  reportedAt: Map<string, number>
  limit?: number
}

export function buildDailyReport(input: BuildDailyReportInput): SignalReportPayload {
  // 日报取的是「截至生成时间的最近 24 小时」，不是日历日：抓回来的通知常常是昨天发的，
  // 按日历日切会把它挡在门外，当天的日报就成了空的。
  const start = input.generatedAt - 24 * SIGNAL_HOUR_MS
  const end = input.generatedAt + SIGNAL_HOUR_MS
  const limit = Math.max(1, input.limit ?? SIGNAL_REPORT_LEAD_LIMIT + 12)

  const sameDay = input.events.filter(event => event.lastSeenAt >= start && event.lastSeenAt < end)
  // 先按标题去重再判新鲜度：同一天里同标题的低分副本不该顶替已经报过的那条。
  const ordered = dedupeReportEvents(sameDay)
    .filter((event) => {
      const reported = input.reportedAt.get(event.id)
      if (reported === undefined) return true
      return event.lastSeenAt > reported + SIGNAL_HOUR_MS
    })
    .slice(0, limit)
  const items = ordered.map(event => toReportItem(event, start))
  const lead = items.slice(0, SIGNAL_REPORT_LEAD_LIMIT)

  const rest = items.slice(SIGNAL_REPORT_LEAD_LIMIT)
  const buckets = new Map<string, SignalReportItem[]>()
  for (const item of rest) {
    const bucket = buckets.get(item.category) ?? []
    bucket.push(item)
    buckets.set(item.category, bucket)
  }
  const sections: SignalReportSection[] = [...buckets.entries()]
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
    .slice(0, SIGNAL_REPORT_SECTION_LIMIT)
    .map(([category, bucket]) => ({
      key: category,
      title: category,
      items: bucket.slice(0, SIGNAL_REPORT_SECTION_ITEM_LIMIT)
    }))

  const sources = items.reduce((total, item) => total + item.sourceCount, 0)
  const label = signalPeriodLabel('daily', input.periodKey)

  return {
    kind: 'daily',
    periodKey: input.periodKey,
    label,
    title: `${label} 校园信号日报`,
    generatedAt: input.generatedAt,
    lead,
    sections,
    stats: {
      events: items.length,
      newEvents: items.filter(item => item.isNew).length,
      sources
    }
  }
}

export interface BuildPeriodReportInput {
  kind: Extract<SignalReportKind, 'weekly' | 'monthly'>
  periodKey: string
  generatedAt: number
  /** 周期内按日升序排列的日报，没有那天就传 null。 */
  dailies: Array<{ periodKey: string, payload: SignalReportPayload }>
}

/** 周报/月报不重新打分，直接按日把日报的条目重新排一遍。 */
export function buildPeriodReport(input: BuildPeriodReportInput): SignalReportPayload {
  const label = signalPeriodLabel(input.kind, input.periodKey)
  const seen = new Set<string>()
  const sections: SignalReportSection[] = []
  const all: SignalReportItem[] = []

  for (const daily of input.dailies) {
    const items: SignalReportItem[] = []
    for (const item of [...daily.payload.lead, ...daily.payload.sections.flatMap(section => section.items)]) {
      if (seen.has(item.eventId)) continue
      seen.add(item.eventId)
      const carried: SignalReportItem = { ...item }
      items.push(carried)
      all.push(carried)
    }
    if (items.length === 0) continue
    sections.push({
      key: daily.periodKey,
      title: daily.payload.label,
      items: items.slice(0, SIGNAL_REPORT_SECTION_ITEM_LIMIT)
    })
  }

  all.sort((left, right) => right.heat - left.heat || left.eventId.localeCompare(right.eventId))
  const lead = all.slice(0, SIGNAL_REPORT_LEAD_LIMIT)

  return {
    kind: input.kind,
    periodKey: input.periodKey,
    label,
    title: `${label} 校园信号${input.kind === 'weekly' ? '周报' : '月报'}`,
    generatedAt: input.generatedAt,
    lead,
    sections: sections.slice(0, SIGNAL_REPORT_SECTION_LIMIT),
    stats: {
      events: all.length,
      newEvents: all.filter(item => item.isNew).length,
      sources: all.reduce((total, item) => total + item.sourceCount, 0)
    }
  }
}
