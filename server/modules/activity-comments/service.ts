import { randomUUID } from 'node:crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import { createError } from 'h3'
import type { ApiActivityComment } from '../../../shared/types/server'
import type { DatabaseClient } from '../../database/client'
import { activities, activityComments, users } from '../../database/schema'

export const ACTIVITY_COMMENTS_LIMIT = 50
export const ACTIVITY_COMMENT_BODY_MAX = 300
export const ACTIVITY_COMMENT_IMAGE_MAX = 3

const IMAGE_URL = /^\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:png|jpg|webp)$/i

export interface ActivityCommentInput {
  activitySlug: string
  body: string
  images: string[]
}

export interface ActivityCommentIdentity {
  userId?: string
  anonymousKey?: string
}

export interface ActivityCommentsPayload {
  items: ApiActivityComment[]
  total: number
}

function parseImages(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && IMAGE_URL.test(item))
  } catch {
    return []
  }
}

export function sanitizeActivityCommentImages(images: string[]): string[] {
  const seen: string[] = []
  for (const url of images) {
    const trimmed = url.trim()
    if (!IMAGE_URL.test(trimmed) || seen.includes(trimmed)) continue
    seen.push(trimmed)
    if (seen.length >= ACTIVITY_COMMENT_IMAGE_MAX) break
  }
  return seen
}

function displayNameOf(userId: string | null, nickname: string | null): string {
  if (nickname && nickname.trim()) return nickname.trim().slice(0, 12)
  return userId ? '同学' : '访客'
}

function publishedActivity(client: DatabaseClient, slug: string) {
  const row = client.db
    .select({ id: activities.id, status: activities.status })
    .from(activities)
    .where(eq(activities.slug, slug))
    .get()
  if (!row || row.status !== 'published') {
    throw createError({
      statusCode: 404,
      statusMessage: '活动不存在',
      data: { code: 'ACTIVITY_NOT_FOUND' }
    })
  }
  return row
}

/** 活动详情页与地图卡片共用；只返回展示中的留言。 */
export function listActivityComments(
  client: DatabaseClient,
  activitySlug: string
): ActivityCommentsPayload {
  const activity = publishedActivity(client, activitySlug)
  const rows = client.db
    .select({
      id: activityComments.id,
      body: activityComments.body,
      images: activityComments.images,
      createdAt: activityComments.createdAt,
      userId: activityComments.userId,
      nickname: users.displayName
    })
    .from(activityComments)
    .leftJoin(users, eq(activityComments.userId, users.id))
    .where(and(
      eq(activityComments.activityId, activity.id),
      eq(activityComments.status, 'approved')
    ))
    .orderBy(desc(activityComments.createdAt))
    .limit(ACTIVITY_COMMENTS_LIMIT)
    .all()

  const total = client.db
    .select({ count: sql<number>`count(*)` })
    .from(activityComments)
    .where(and(
      eq(activityComments.activityId, activity.id),
      eq(activityComments.status, 'approved')
    ))
    .get()

  return {
    items: rows.map(row => ({
      id: row.id,
      body: row.body,
      images: parseImages(row.images),
      displayName: displayNameOf(row.userId, row.nickname),
      createdAt: new Date(row.createdAt ?? Date.now()).toISOString()
    })),
    total: total?.count ?? 0
  }
}

export function createActivityComment(
  client: DatabaseClient,
  input: ActivityCommentInput,
  identity: ActivityCommentIdentity,
  ip?: string | null
): { comment: ApiActivityComment } {
  const identityKey = identity.userId ?? identity.anonymousKey
  if (!identityKey) throw new Error('ACTIVITY_COMMENT_IDENTITY_REQUIRED')

  const activity = publishedActivity(client, input.activitySlug)
  const body = input.body.trim().slice(0, ACTIVITY_COMMENT_BODY_MAX)
  const images = sanitizeActivityCommentImages(input.images)

  if (!body && images.length === 0) {
    throw createError({
      statusCode: 422,
      statusMessage: '写点内容或上传一张照片',
      data: { code: 'ACTIVITY_COMMENT_EMPTY' }
    })
  }
  if (body.includes('�')) {
    throw createError({
      statusCode: 422,
      statusMessage: '内容包含无法识别的字符，请删掉后重新提交',
      data: { code: 'ACTIVITY_COMMENT_ENCODING' }
    })
  }

  const id = randomUUID()
  const now = Date.now()
  client.db.insert(activityComments).values({
    id,
    activityId: activity.id,
    userId: identity.userId ?? null,
    anonymousKey: identity.anonymousKey ?? null,
    body,
    images: JSON.stringify(images),
    ip: ip ?? null,
    status: 'approved',
    createdAt: now
  }).run()

  return {
    comment: {
      id,
      body,
      images,
      displayName: identity.userId ? '同学' : '访客',
      createdAt: new Date(now).toISOString()
    }
  }
}
