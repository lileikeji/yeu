import { and, countDistinct, desc, eq, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { DatabaseClient } from '../../database/client'
import { contents, visitorEvents } from '../../database/schema'
import { activePublicContentCondition } from '../content/visibility'
import { ensureVisitor, recordVisitorEvent } from '../visitors/service'
import { safeMetadata, serializeContent } from '../../utils/serializers'
import { getContentSourceMap } from '../verification/service'

function confirmationCondition(noticeId: string) {
  return and(
    eq(visitorEvents.action, 'notice_confirm'),
    sql`json_extract(${visitorEvents.metaJson}, '$.noticeId') = ${noticeId}`
  )
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

  const items = rows.map((row) => {
    const confirmationCount = client.db.select({ value: countDistinct(visitorEvents.visitorId) })
      .from(visitorEvents)
      .where(confirmationCondition(row.id))
      .get()?.value ?? 0
    const confirmed = Boolean(client.db.select({ id: visitorEvents.id })
      .from(visitorEvents)
      .where(and(
        confirmationCondition(row.id),
        eq(visitorEvents.visitorId, visitor.id)
      ))
      .limit(1)
      .get())

    return {
      ...serializeContent(row, sourceMap.get(row.id) ?? []),
      pinned: safeMetadata(row.metadataJson).pinned === true,
      confirmationCount,
      confirmed
    }
  })

  items.sort((a, b) => Number(b.pinned) - Number(a.pinned)
    || Date.parse(b.publishedAt ?? b.updatedAt) - Date.parse(a.publishedAt ?? a.updatedAt))
  return { items, total: items.length }
}

export function confirmPublicNotice(event: H3Event, client: DatabaseClient, noticeId: string) {
  const notice = client.db.select({ id: contents.id }).from(contents)
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
      confirmationCondition(noticeId),
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
