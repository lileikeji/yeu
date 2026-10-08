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
    const metadata = safeMetadata(row.metadataJson)
    const confirmationCount = client.db.select({ value: countDistinct(visitorEvents.visitorId) })
      .from(visitorEvents)
      .where(confirmationCondition(row.id))
      .get()?.value ?? 0
    const confirmed = Boolean(client.db.select({ id: visitorEvents.id })
      .from(visitorEvents)
      .where(and(
        // A published edit is a new announcement version. A visitor who read
        // an older version should see the updated notice once more.
        confirmationCondition(row.id, row.updatedAt),
        eq(visitorEvents.visitorId, visitor.id)
      ))
      .limit(1)
      .get())

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
