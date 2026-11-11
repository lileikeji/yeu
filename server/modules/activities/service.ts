import { randomBytes, randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { and, asc, count, desc, eq, gte, isNotNull, isNull, like, or, sql, type SQL } from 'drizzle-orm'
import { pinyin } from 'pinyin-pro'
import type { z } from 'zod'
import type { ActivityStatus } from '../../../shared/constants/server'
import type {
  adminActivitiesQuerySchema,
  createActivitySchema,
  reviewActivitySchema,
  updateActivitySchema
} from '../../../shared/schemas/server'
import type {
  ApiActivity,
  ApiActivityPlace,
  ApiActivitySummary,
  ApiAdminActivity,
  ApiPublicActivity
} from '../../../shared/types/server'
import type { DatabaseClient } from '../../database/client'
import { activities, contents, places } from '../../database/schema'
import { requireSuperAdmin, type AdminSessionContext } from '../../utils/auth'
import { mailerConfigFromEnv, sendMailMessage } from '../../utils/mailer'
import { cleanSearchTerm } from '../../../shared/utils/like-search'

type CreateActivityInput = z.infer<typeof createActivitySchema>
type UpdateActivityInput = z.infer<typeof updateActivitySchema>
type ReviewActivityInput = z.infer<typeof reviewActivitySchema>
type AdminActivitiesQuery = z.infer<typeof adminActivitiesQuerySchema>

type ActivityRow = typeof activities.$inferSelect
type ContentRow = typeof contents.$inferSelect
type PlaceRow = typeof places.$inferSelect

interface JoinedActivityRow {
  activity: ActivityRow
  organization: ContentRow
  place: PlaceRow | null
}

const ACTIVITY_PUBLIC_GRACE_MS = 12 * 60 * 60 * 1000
const ACTIVITY_PAST_WINDOW_MS = 90 * 24 * 60 * 60 * 1000

function activityError(statusCode: number, statusMessage: string, code: string): never {
  throw createError({
    statusCode,
    statusMessage,
    data: { code }
  })
}

function toIso(value: number | null | undefined): string | null {
  return typeof value === 'number' ? new Date(value).toISOString() : null
}

function parsePhotos(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is string => typeof item === 'string' && item.length > 0)
      .slice(0, 9)
  } catch {
    return []
  }
}

function serializeOrganization(row: ContentRow) {
  if (row.kind !== 'club' && row.kind !== 'department') return null
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    kind: row.kind
  }
}

function serializePlace(row: PlaceRow | null, publicView: boolean): ApiActivityPlace | null {
  if (!row) return null
  if (publicView && row.status !== 'published') return null
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    type: row.type,
    category: row.category
  }
}

function baseActivity(row: JoinedActivityRow, publicView: boolean): ApiActivity {
  return {
    id: row.activity.id,
    slug: row.activity.slug,
    title: row.activity.title,
    summary: row.activity.summary,
    body: row.activity.body,
    room: row.activity.room,
    photos: parsePhotos(row.activity.photosJson),
    startsAt: new Date(row.activity.startsAt).toISOString(),
    endsAt: toIso(row.activity.endsAt),
    status: row.activity.status,
    organization: serializeOrganization(row.organization),
    place: serializePlace(row.place, publicView),
    submittedAt: toIso(row.activity.submittedAt),
    reviewedAt: toIso(row.activity.reviewedAt),
    reviewNote: row.activity.reviewNote,
    publishedAt: toIso(row.activity.publishedAt),
    createdAt: new Date(row.activity.createdAt).toISOString(),
    updatedAt: new Date(row.activity.updatedAt).toISOString()
  }
}

function serializeAdminActivity(row: JoinedActivityRow): ApiAdminActivity {
  return {
    ...baseActivity(row, false),
    createdByAdminId: row.activity.createdByAdminId
  }
}

function serializePublicActivity(row: JoinedActivityRow): ApiPublicActivity {
  const activity = baseActivity(row, true)
  return {
    id: activity.id,
    slug: activity.slug,
    title: activity.title,
    summary: activity.summary,
    body: activity.body,
    room: activity.room,
    photos: activity.photos,
    startsAt: activity.startsAt,
    endsAt: activity.endsAt,
    organization: activity.organization,
    place: activity.place,
    publishedAt: activity.publishedAt,
    updatedAt: activity.updatedAt
  }
}

function serializeSummary(row: JoinedActivityRow): ApiActivitySummary {
  const activity = baseActivity(row, true)
  return {
    id: activity.id,
    slug: activity.slug,
    title: activity.title,
    summary: activity.summary,
    coverUrl: activity.photos[0] ?? null,
    photos: activity.photos,
    startsAt: activity.startsAt,
    endsAt: activity.endsAt,
    room: activity.room,
    organization: activity.organization,
    place: activity.place
  }
}

function activityQuery(client: DatabaseClient) {
  return client.db.select({
    activity: activities,
    organization: contents,
    place: places
  }).from(activities)
    .innerJoin(contents, eq(contents.id, activities.organizationContentId))
    .leftJoin(places, eq(places.id, activities.placeId))
}

function requireOrganizationContentId(session: AdminSessionContext): string {
  const contentId = session.admin.organization?.contentId
  if (session.admin.role !== 'organization' || !contentId) {
    activityError(403, 'Organization administrator required', 'ACTIVITY_ORGANIZATION_REQUIRED')
  }
  return contentId
}

function assertActivityEditable(activity: ActivityRow): void {
  if (activity.status !== 'draft' && activity.status !== 'rejected') {
    activityError(
      409,
      'Only draft or rejected activities can be edited',
      'ACTIVITY_NOT_EDITABLE'
    )
  }
}

function assertPlaceAssignable(client: DatabaseClient, placeId: string | null | undefined): void {
  if (!placeId) return
  const place = client.db.select({
    status: places.status,
    type: places.type,
    scope: places.scope,
    category: places.category
  }).from(places).where(eq(places.id, placeId)).get()

  // 校园活动不只进教学楼：宏船楼是 building，普照大礼堂是 event-venue/
  // service，只要地点本身已发布且在校园范围内，就允许关联。
  if (!place || place.status !== 'published' || place.scope !== 'campus') {
    activityError(
      422,
      'Activity place must be a published campus place',
      'ACTIVITY_PLACE_INVALID'
    )
  }
}

function slugifyTitle(title: string): string {
  const pinyinText = pinyin(title, { toneType: 'none', type: 'array' }).join('-')
  const normalized = pinyinText.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
  return normalized || 'activity'
}

function generateActivitySlug(client: DatabaseClient, title: string): string {
  const base = slugifyTitle(title)
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const slug = `${base}-${randomBytes(3).toString('hex')}`
    const exists = client.db.select({ id: activities.id }).from(activities)
      .where(eq(activities.slug, slug))
      .get()
    if (!exists) return slug
  }
  activityError(500, 'Unable to allocate an activity slug', 'ACTIVITY_SLUG_UNAVAILABLE')
}

export function listAdminActivities(
  client: DatabaseClient,
  session: AdminSessionContext,
  query: AdminActivitiesQuery
) {
  const scopeConditions: SQL[] = []
  if (session.admin.role === 'organization') {
    scopeConditions.push(eq(activities.organizationContentId, requireOrganizationContentId(session)))
  } else if (query.organization) {
    scopeConditions.push(eq(activities.organizationContentId, query.organization))
  }

  const conditions = [...scopeConditions]
  if (query.status) conditions.push(eq(activities.status, query.status))
  const search = query.q ? cleanSearchTerm(query.q) : ''
  if (search) {
    conditions.push(or(
      like(activities.title, `%${search}%`),
      like(activities.summary, `%${search}%`)
    )!)
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined
  const scopeWhere = scopeConditions.length > 0 ? and(...scopeConditions) : undefined
  const offset = (query.page - 1) * query.pageSize

  const rows = activityQuery(client)
    .where(where)
    .orderBy(desc(activities.updatedAt), desc(activities.createdAt))
    .limit(query.pageSize)
    .offset(offset)
    .all()
  const total = client.db.select({ value: count() }).from(activities)
    .innerJoin(contents, eq(contents.id, activities.organizationContentId))
    .where(where)
    .get()?.value ?? 0
  const counts: Record<ActivityStatus, number> = {
    draft: 0,
    pending: 0,
    published: 0,
    rejected: 0,
    archived: 0
  }
  const countRows = client.db.select({
    status: activities.status,
    value: count()
  }).from(activities)
    .innerJoin(contents, eq(contents.id, activities.organizationContentId))
    .where(scopeWhere)
    .groupBy(activities.status)
    .all()
  for (const row of countRows) counts[row.status] = row.value

  return {
    items: rows.map(serializeAdminActivity),
    total,
    page: query.page,
    pageSize: query.pageSize,
    counts
  }
}

export function getAdminActivity(
  client: DatabaseClient,
  session: AdminSessionContext,
  id: string
): ApiAdminActivity {
  const row = activityQuery(client)
    .where(eq(activities.id, id))
    .get()

  if (!row || (session.admin.role === 'organization'
    && row.activity.organizationContentId !== session.admin.organization?.contentId)) {
    activityError(404, 'Activity not found', 'ACTIVITY_NOT_FOUND')
  }
  return serializeAdminActivity(row)
}

export function createActivity(
  client: DatabaseClient,
  session: AdminSessionContext,
  input: CreateActivityInput
): ApiAdminActivity {
  const organizationContentId = requireOrganizationContentId(session)
  assertPlaceAssignable(client, input.placeId)

  const now = Date.now()
  const id = randomUUID()
  client.db.insert(activities).values({
    id,
    slug: generateActivitySlug(client, input.title),
    organizationContentId,
    placeId: input.placeId ?? null,
    room: input.room ?? null,
    title: input.title,
    summary: input.summary,
    body: input.body,
    photosJson: JSON.stringify(input.photos),
    startsAt: Date.parse(input.startsAt),
    endsAt: input.endsAt ? Date.parse(input.endsAt) : null,
    status: 'draft',
    createdByAdminId: session.admin.id,
    createdAt: now,
    updatedAt: now
  }).run()

  return getAdminActivity(client, session, id)
}

export function updateActivity(
  client: DatabaseClient,
  session: AdminSessionContext,
  id: string,
  input: UpdateActivityInput
): ApiAdminActivity {
  if (session.admin.role !== 'organization') {
    activityError(403, 'Super administrators review activities instead of editing them', 'ACTIVITY_REVIEW_ONLY')
  }
  const organizationContentId = requireOrganizationContentId(session)
  const current = client.db.select().from(activities).where(eq(activities.id, id)).get()
  if (!current || current.organizationContentId !== organizationContentId) {
    activityError(404, 'Activity not found', 'ACTIVITY_NOT_FOUND')
  }
  assertActivityEditable(current)
  if (input.placeId !== undefined) assertPlaceAssignable(client, input.placeId)

  const patch: Partial<typeof activities.$inferInsert> = { updatedAt: Date.now() }
  if (input.title !== undefined) patch.title = input.title
  if (input.summary !== undefined) patch.summary = input.summary
  if (input.body !== undefined) patch.body = input.body
  if (input.room !== undefined) patch.room = input.room
  if (input.placeId !== undefined) patch.placeId = input.placeId
  if (input.photos !== undefined) patch.photosJson = JSON.stringify(input.photos)
  if (input.startsAt !== undefined) patch.startsAt = Date.parse(input.startsAt)
  if (input.endsAt !== undefined) patch.endsAt = input.endsAt ? Date.parse(input.endsAt) : null

  const startsAt = patch.startsAt ?? current.startsAt
  const endsAt = patch.endsAt !== undefined ? patch.endsAt : current.endsAt
  if (endsAt != null && endsAt < startsAt) {
    activityError(422, 'End time must not be earlier than start time', 'ACTIVITY_TIME_INVALID')
  }

  client.db.update(activities).set(patch).where(eq(activities.id, id)).run()
  return getAdminActivity(client, session, id)
}

export function submitActivity(
  client: DatabaseClient,
  session: AdminSessionContext,
  id: string
): ApiAdminActivity {
  const organizationContentId = requireOrganizationContentId(session)
  const current = client.db.select().from(activities).where(eq(activities.id, id)).get()
  if (!current || current.organizationContentId !== organizationContentId) {
    activityError(404, 'Activity not found', 'ACTIVITY_NOT_FOUND')
  }
  assertActivityEditable(current)

  client.db.update(activities).set({
    status: 'pending',
    submittedAt: Date.now(),
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    updatedAt: Date.now()
  }).where(eq(activities.id, id)).run()

  return getAdminActivity(client, session, id)
}

export function reviewActivity(
  client: DatabaseClient,
  session: AdminSessionContext,
  id: string,
  input: ReviewActivityInput
): ApiAdminActivity {
  requireSuperAdmin(session)
  const current = client.db.select().from(activities).where(eq(activities.id, id)).get()
  if (!current) activityError(404, 'Activity not found', 'ACTIVITY_NOT_FOUND')
  if (current.status !== 'pending') {
    activityError(409, 'Only pending activities can be reviewed', 'ACTIVITY_NOT_PENDING')
  }

  const now = Date.now()
  const approved = input.decision === 'approve'
  client.db.update(activities).set({
    status: approved ? 'published' : 'rejected',
    reviewedBy: session.admin.id,
    reviewedAt: now,
    reviewNote: input.note ?? null,
    publishedAt: approved ? now : null,
    updatedAt: now
  }).where(eq(activities.id, id)).run()

  return getAdminActivity(client, session, id)
}

export function archiveActivity(
  client: DatabaseClient,
  session: AdminSessionContext,
  id: string
): ApiAdminActivity {
  const current = client.db.select().from(activities).where(eq(activities.id, id)).get()
  if (!current) activityError(404, 'Activity not found', 'ACTIVITY_NOT_FOUND')

  if (session.admin.role === 'organization') {
    if (current.organizationContentId !== session.admin.organization?.contentId) {
      activityError(404, 'Activity not found', 'ACTIVITY_NOT_FOUND')
    }
    if (current.status !== 'published') {
      activityError(409, 'Only published activities can be archived', 'ACTIVITY_NOT_PUBLISHED')
    }
  }

  client.db.update(activities).set({
    status: 'archived',
    updatedAt: Date.now()
  }).where(eq(activities.id, id)).run()

  return getAdminActivity(client, session, id)
}

export function deleteActivity(
  client: DatabaseClient,
  session: AdminSessionContext,
  id: string
): void {
  const current = client.db.select().from(activities).where(eq(activities.id, id)).get()
  if (!current) activityError(404, 'Activity not found', 'ACTIVITY_NOT_FOUND')

  if (session.admin.role === 'organization') {
    if (current.organizationContentId !== session.admin.organization?.contentId) {
      activityError(404, 'Activity not found', 'ACTIVITY_NOT_FOUND')
    }
    if (current.status !== 'draft' && current.status !== 'rejected') {
      activityError(409, 'Only draft or rejected activities can be deleted', 'ACTIVITY_NOT_DELETABLE')
    }
  }

  client.db.delete(activities).where(eq(activities.id, id)).run()
}

export function listPublicActivities(
  client: DatabaseClient,
  options: {
    organization?: string
    place?: string
    limit: number
    includePast: boolean
  }
): { items: ApiActivitySummary[], total: number } {
  const now = Date.now()
  const conditions: SQL[] = [eq(activities.status, 'published')]
  if (options.organization) conditions.push(eq(contents.slug, options.organization))
  if (options.place) conditions.push(eq(places.slug, options.place))

  if (options.includePast) {
    conditions.push(gte(
      sql<number>`coalesce(${activities.endsAt}, ${activities.startsAt})`,
      now - ACTIVITY_PAST_WINDOW_MS
    ))
  } else {
    conditions.push(or(
      and(isNotNull(activities.endsAt), gte(activities.endsAt, now)),
      and(isNull(activities.endsAt), gte(activities.startsAt, now - ACTIVITY_PUBLIC_GRACE_MS))
    )!)
  }

  const rows = activityQuery(client)
    .where(and(...conditions))
    .orderBy(options.includePast ? desc(activities.startsAt) : asc(activities.startsAt))
    .limit(options.limit)
    .all()

  return {
    items: rows.map(serializeSummary),
    total: rows.length
  }
}

export function listHomepageActivities(
  client: DatabaseClient,
  limit = 5
): ApiActivitySummary[] {
  return listPublicActivities(client, { limit, includePast: false }).items
}

/**
 * 地图建筑图标上的活动红点：只返回“已发布且尚未结束”的活动关联地点。
 * 与活动列表使用同一条时间边界，避免列表已经结束、红点还挂着。
 */
export function listActivityPlaceIds(client: DatabaseClient): string[] {
  const now = Date.now()
  const rows = client.db
    .select({ placeId: activities.placeId })
    .from(activities)
    .where(and(
      eq(activities.status, 'published'),
      isNotNull(activities.placeId),
      or(
        and(isNotNull(activities.endsAt), gte(activities.endsAt, now)),
        and(isNull(activities.endsAt), gte(activities.startsAt, now - ACTIVITY_PUBLIC_GRACE_MS))
      )
    ))
    .groupBy(activities.placeId)
    .all()

  return rows
    .map(row => row.placeId)
    .filter((placeId): placeId is string => Boolean(placeId))
}

export function getPublicActivity(client: DatabaseClient, slug: string): ApiPublicActivity {
  const row = activityQuery(client)
    .where(and(eq(activities.slug, slug), eq(activities.status, 'published')))
    .get()

  if (!row) activityError(404, 'Activity not found', 'ACTIVITY_NOT_FOUND')
  return serializePublicActivity(row)
}

export function activityReviewRecipients(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = String(env.ACTIVITY_REVIEW_EMAIL || env.ALERT_TO_EMAIL || '')
  return raw
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * 提交审核后通知总管理员。邮件失败只记录日志：活动已经进入 pending，
 * 不能因为 SMTP 抖动把组织管理员的提交动作整体回滚成 500。
 */
export async function notifyActivitySubmitted(activity: ApiAdminActivity): Promise<void> {
  const recipients = activityReviewRecipients()
  if (recipients.length === 0) {
    console.warn('[activities] ACTIVITY_REVIEW_EMAIL/ALERT_TO_EMAIL is not configured; review email skipped')
    return
  }
  const config = mailerConfigFromEnv()
  if (!config) {
    console.warn('[activities] QQ_EMAIL/QQ_EMAIL_AUTH_CODE is not configured; review email skipped')
    return
  }

  const origin = String(process.env.NUXT_PUBLIC_SITE_URL || 'https://yx.huiliyill.cn')
    .replace(/\/+$/, '')
  const reviewUrl = `${origin}/admin/activities?status=pending`
  const organizationTitle = activity.organization?.title || '未命名组织'
  const placeText = activity.place
    ? `${activity.place.name}${activity.room ? ` ${activity.room}` : ''}`
    : '未关联教学楼'
  const startsAt = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    dateStyle: 'full',
    timeStyle: 'short'
  }).format(new Date(activity.startsAt))

  const subject = `【活动待审核】${organizationTitle}：${activity.title}`
  const text = [
    `${organizationTitle} 提交了一个活动，等待审核。`,
    `活动：${activity.title}`,
    `时间：${startsAt}`,
    `地点：${placeText}`,
    `简介：${activity.summary}`,
    `审核入口：${reviewUrl}`
  ].join('\n')
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.7;color:#18181b">
      <p><strong>${escapeHtml(organizationTitle)}</strong> 提交了一个活动，等待审核。</p>
      <p><strong>活动：</strong>${escapeHtml(activity.title)}<br>
      <strong>时间：</strong>${escapeHtml(startsAt)}<br>
      <strong>地点：</strong>${escapeHtml(placeText)}</p>
      <p><strong>简介：</strong>${escapeHtml(activity.summary)}</p>
      <p><a href="${escapeHtml(reviewUrl)}">前往后台审核</a></p>
    </div>
  `

  try {
    await sendMailMessage(config, {
      to: recipients.join(','),
      subject,
      text,
      html
    }, { fromName: '仰恩校园活动' })
  } catch (error) {
    console.warn('[activities] failed to send review email', error)
  }
}
