import { and, eq } from 'drizzle-orm'
import type { ApiActivitySummary, ApiPlaceFeedItem } from '../../../shared/types/server'
import type { DatabaseClient } from '../../database/client'
import { places } from '../../database/schema'
import { listPublicActivities } from '../activities/service'
import { listPublishedEventsForPlace } from '../signal/service'

function shanghaiDateKey(milliseconds: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(milliseconds))
}

function signalAt(event: ReturnType<typeof listPublishedEventsForPlace>[number]): number {
  if (event.dateHint) {
    // 只有日期没有时刻：用当天中午参与排序，避免被时区推到前一天。
    return Date.parse(`${event.dateHint.date}T12:00:00+08:00`)
  }
  return Date.parse(event.lastSeenAt)
}

function signalItem(
  event: ReturnType<typeof listPublishedEventsForPlace>[number],
  todayKey: string
): ApiPlaceFeedItem {
  const at = signalAt(event)
  return {
    kind: 'signal',
    id: event.slug,
    slug: event.slug,
    title: event.title,
    summary: event.summary,
    at: new Date(at).toISOString(),
    dateHint: event.dateHint?.date ?? null,
    status: event.dateHint && event.dateHint.date >= todayKey ? 'upcoming' : 'started',
    room: null,
    coverUrl: null,
    organization: null,
    channel: event.channel
  }
}

function activityItem(activity: ApiActivitySummary, now: number): ApiPlaceFeedItem {
  return {
    kind: 'activity',
    id: activity.id,
    slug: activity.slug,
    title: activity.title,
    summary: activity.summary,
    at: activity.startsAt,
    dateHint: null,
    status: Date.parse(activity.startsAt) > now ? 'upcoming' : 'started',
    room: activity.room,
    coverUrl: activity.coverUrl,
    organization: activity.organization,
    channel: null
  }
}

function resolvePlaceSlugs(
  client: DatabaseClient,
  place: { slug?: string | null, name?: string | null }
): string[] {
  const slugs = new Set<string>()
  const name = (place.name ?? '').trim()
  if (place.slug) {
    const row = client.db.select({ slug: places.slug })
      .from(places)
      .where(and(eq(places.status, 'published'), eq(places.slug, place.slug)))
      .get()
    if (row?.slug) slugs.add(row.slug)
  }
  if (name && slugs.size === 0) {
    const rows = client.db.select({ slug: places.slug })
      .from(places)
      .where(and(eq(places.status, 'published'), eq(places.name, name)))
      .all()
    for (const row of rows) {
      if (row.slug) slugs.add(row.slug)
    }
  }
  return [...slugs]
}

/**
 * 地图地点卡片的数据源：通知事件和活动合到一条时间线，再按「未开始 / 已开始」
 * 分组。活动只取已发布且关联到该点位的行；最多保留 90 天内的已结束活动，
 * 与活动列表页的窗口保持一致。
 */
export function listPlaceFeed(
  client: DatabaseClient,
  place: { slug?: string | null, name?: string | null },
  limit = 10
): ApiPlaceFeedItem[] {
  const placeSlugs = resolvePlaceSlugs(client, place)
  if (placeSlugs.length === 0) return []

  const now = Date.now()
  const todayKey = shanghaiDateKey(now)
  const safeLimit = Math.min(Math.max(limit, 1), 20)
  const items: ApiPlaceFeedItem[] = []
  const seenActivities = new Set<string>()

  for (const event of listPublishedEventsForPlace(client, place, safeLimit)) {
    items.push(signalItem(event, todayKey))
  }

  for (const slug of placeSlugs) {
    const activities = listPublicActivities(client, {
      place: slug,
      limit: safeLimit,
      includePast: true
    }).items
    for (const activity of activities) {
      if (seenActivities.has(activity.id)) continue
      seenActivities.add(activity.id)
      items.push(activityItem(activity, now))
    }
  }

  return items
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))
    .slice(0, safeLimit)
}
