import { and, countDistinct, desc, eq, gte, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { DatabaseClient } from '../../database/client'
import { contents, visitorEvents } from '../../database/schema'
import { activePublicContentCondition } from '../content/visibility'
import { ensureVisitor, recordVisitorEvent } from '../visitors/service'
import { safeMetadata, serializeContent } from '../../utils/serializers'
import { getContentSourceMap } from '../verification/service'
import { getPublicContent } from '../content/service'
import { normalizeNoticeActions } from '../../../shared/utils/notice-actions'
import { sortPublicNoticeItems } from './sorting'

// 表达式索引（migration 0052）按这个表达式建，查询里必须字面一致才会被规划器命中。
const noticeIdExpression = sql<string | null>`json_extract(${visitorEvents.metaJson}, '$.noticeId')`

function confirmationCondition(noticeId: string, afterUpdatedAt?: number) {
  const conditions = [
    eq(visitorEvents.action, 'notice_confirm'),
    sql`json_extract(${visitorEvents.metaJson}, '$.noticeId') = ${noticeId}`
  ]
  if (afterUpdatedAt !== undefined) {
    conditions.push(gte(visitorEvents.createdAt, afterUpdatedAt))
  }
  return and(...conditions)
}

/** 一次 GROUP BY 取全部公告的确认人数；不要退回「每条公告一次 count」。 */
function listConfirmationCounts(client: DatabaseClient): Map<string, number> {
  const rows = client.db.select({
    noticeId: noticeIdExpression,
    value: sql<number>`count(distinct ${visitorEvents.visitorId})`
  })
    .from(visitorEvents)
    .where(eq(visitorEvents.action, 'notice_confirm'))
    .groupBy(noticeIdExpression)
    .all()
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (typeof row.noticeId === 'string' && row.noticeId) counts.set(row.noticeId, Number(row.value) || 0)
  }
  return counts
}

/**
 * 当前访客对每条公告的最后一次确认时间。
 * 原实现是每条公告一次 EXISTS；「最后确认时间 >= 公告 updatedAt」与
 * `createdAt >= updatedAt` 的 EXISTS 等价，所以合成一次 GROUP BY。
 */
function listVisitorConfirmationTimes(client: DatabaseClient, visitorId: string): Map<string, number> {
  const rows = client.db.select({
    noticeId: noticeIdExpression,
    lastConfirmedAt: sql<number | null>`max(${visitorEvents.createdAt})`
  })
    .from(visitorEvents)
    .where(and(
      eq(visitorEvents.action, 'notice_confirm'),
      eq(visitorEvents.visitorId, visitorId)
    ))
    .groupBy(noticeIdExpression)
    .all()
  const times = new Map<string, number>()
  for (const row of rows) {
    if (typeof row.noticeId === 'string' && row.noticeId) times.set(row.noticeId, Number(row.lastConfirmedAt) || 0)
  }
  return times
}

export function listPublicNotices(event: H3Event, client: DatabaseClient) {
  const visitor = ensureVisitor(event, client, { path: getRequestURL(event).pathname })
  const rows = client.db.select().from(contents)
    .where(and(
      eq(contents.kind, 'notice'),
      eq(contents.status, 'published'),
      activePublicContentCondition()
    ))
    .orderBy(desc(contents.publishedAt), desc(contents.updatedAt))
    .all()
  const sourceMap = getContentSourceMap(client, rows.map(row => row.id))
  // 两条聚合查询替代「每条公告 1 次 count + 1 次 EXISTS」。20 万事件夹具下
  // 公告列表从 2N 次 json_extract 扫描降到 2 次（含 migration 0052 的表达式索引）。
  const confirmationCounts = listConfirmationCounts(client)
  const visitorConfirmationTimes = listVisitorConfirmationTimes(client, visitor.id)

  const items = rows.map((row) => {
    const metadata = safeMetadata(row.metadataJson)
    const confirmationCount = confirmationCounts.get(row.id) ?? 0
    // A published edit is a new announcement version. A visitor who read
    // an older version should see the updated notice once more.
    const confirmed = (visitorConfirmationTimes.get(row.id) ?? Number.NEGATIVE_INFINITY) >= row.updatedAt

    return {
      ...serializeContent(row, sourceMap.get(row.id) ?? []),
      pinned: metadata.pinned === true,
      sortOrder: typeof metadata.sortOrder === 'number'
        && Number.isInteger(metadata.sortOrder)
        && metadata.sortOrder >= 0
        ? metadata.sortOrder
        : null,
      autoPopup: metadata.autoPopup === true,
      actions: normalizeNoticeActions(metadata.noticeActions),
      confirmationCount,
      confirmed
    }
  })

  return { items: sortPublicNoticeItems(items), total: items.length }
}

export function getPublicNotice(event: H3Event, client: DatabaseClient, slug: string) {
  const content = getPublicContent(client, slug, 'notice')
  const visitor = ensureVisitor(event, client, { path: getRequestURL(event).pathname })
  const metadata = safeMetadata(JSON.stringify(content.metadata))
  const confirmationCount = client.db.select({ value: countDistinct(visitorEvents.visitorId) })
    .from(visitorEvents)
    .where(confirmationCondition(content.id))
    .get()?.value ?? 0
  const confirmed = Boolean(client.db.select({ id: visitorEvents.id })
    .from(visitorEvents)
    .where(and(
      confirmationCondition(content.id, Date.parse(content.updatedAt)),
      eq(visitorEvents.visitorId, visitor.id)
    ))
    .limit(1)
    .get())

  return {
    ...content,
    pinned: metadata.pinned === true,
    sortOrder: typeof metadata.sortOrder === 'number' && Number.isInteger(metadata.sortOrder) && metadata.sortOrder >= 0
      ? metadata.sortOrder
      : null,
    autoPopup: metadata.autoPopup === true,
    actions: normalizeNoticeActions(metadata.noticeActions),
    confirmationCount,
    confirmed
  }
}

export function confirmPublicNotice(event: H3Event, client: DatabaseClient, noticeId: string) {
  const notice = client.db.select({ id: contents.id, updatedAt: contents.updatedAt }).from(contents)
    .where(and(
      eq(contents.id, noticeId),
      eq(contents.kind, 'notice'),
      eq(contents.status, 'published'),
      activePublicContentCondition()
    ))
    .get()
  if (!notice) {
    throw createError({ statusCode: 404, statusMessage: 'Notice not found' })
  }

  const visitor = ensureVisitor(event, client, { path: getRequestURL(event).pathname })
  const existing = client.db.select({ id: visitorEvents.id }).from(visitorEvents)
    .where(and(
      confirmationCondition(noticeId, notice.updatedAt),
      eq(visitorEvents.visitorId, visitor.id)
    ))
    .limit(1)
    .get()

  if (!existing) {
    recordVisitorEvent(event, client, {
      action: 'notice_confirm',
      path: getRequestURL(event).pathname,
      meta: { noticeId }
    })
  }

  const confirmationCount = client.db.select({ value: countDistinct(visitorEvents.visitorId) })
    .from(visitorEvents)
    .where(confirmationCondition(noticeId))
    .get()?.value ?? 0
  return { ok: true, confirmed: true, confirmationCount }
}
