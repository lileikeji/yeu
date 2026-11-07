import { randomUUID } from 'node:crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import { createError } from 'h3'
import type { DatabaseClient } from '../../database/client'
import { busMoments, users } from '../../database/schema'

export const BUS_MOMENTS_LIMIT = 30
export const BUS_MOMENT_BODY_MAX = 300
/** 车号来自云一卡通 car_name，超长值一律视为非法输入。 */
export const BUS_NAME_MAX = 50

export interface CreateBusMomentInput {
  busName: string
  routeName: string
  body: string
}

export interface BusMomentView {
  id: string
  busName: string
  routeName: string
  body: string
  displayName: string
  createdAt: string
}

export interface BusMomentsPayload {
  busName: string
  moments: BusMomentView[]
}

/** 车号规范化：trim 后截断到上限，空串由调用方（schema 校验）挡。 */
export function normalizeBusName(busName: string): string {
  return busName.trim().slice(0, BUS_NAME_MAX)
}

function displayNameOf(userId: string | null, nickname: string | null): string {
  if (nickname && nickname.trim()) return nickname.trim().slice(0, 12)
  if (userId) return '同学'
  return '访客'
}

export function listBusMoments(
  client: DatabaseClient,
  busName: string,
  limit = BUS_MOMENTS_LIMIT
): BusMomentsPayload {
  const key = normalizeBusName(busName)
  const rows = client.db
    .select({
      id: busMoments.id,
      busName: busMoments.busName,
      routeName: busMoments.routeName,
      body: busMoments.body,
      createdAt: busMoments.createdAt,
      userId: busMoments.userId,
      nickname: users.displayName
    })
    .from(busMoments)
    .leftJoin(users, eq(busMoments.userId, users.id))
    .where(and(eq(busMoments.busName, key), eq(busMoments.status, 'approved')))
    .orderBy(desc(busMoments.createdAt))
    .limit(Math.min(Math.max(limit, 1), BUS_MOMENTS_LIMIT))
    .all()

  return {
    busName: key,
    moments: rows.map(row => ({
      id: row.id,
      busName: row.busName,
      routeName: row.routeName,
      body: row.body,
      displayName: displayNameOf(row.userId, row.nickname),
      createdAt: new Date(row.createdAt ?? Date.now()).toISOString()
    }))
  }
}

export function createBusMoment(
  client: DatabaseClient,
  input: CreateBusMomentInput,
  identity: { userId?: string, anonymousKey?: string },
  ip?: string | null,
  /** AI 巡检启用时先 pending，判定通过才放出；禁用/缺省时直接 approved。 */
  aiEnabled?: boolean
) {
  const identityKey = identity.userId ?? identity.anonymousKey
  if (!identityKey) throw new Error('BUS_MOMENT_IDENTITY_REQUIRED')
  const key = normalizeBusName(input.busName)
  if (!key) {
    throw createError({ statusCode: 422, statusMessage: 'Bus name is empty', data: { code: 'BUS_MOMENT_BUS_EMPTY' } })
  }
  const body = input.body.trim().slice(0, BUS_MOMENT_BODY_MAX)
  if (!body) {
    throw createError({ statusCode: 422, statusMessage: 'Comment is empty', data: { code: 'BUS_MOMENT_EMPTY' } })
  }
  const now = Date.now()
  const id = randomUUID()
  const status = aiEnabled ? 'pending' as const : 'approved' as const
  client.db.insert(busMoments).values({
    id,
    busName: key,
    routeName: input.routeName.trim().slice(0, BUS_NAME_MAX),
    userId: identity.userId ?? null,
    anonymousKey: identity.anonymousKey ?? null,
    ip: ip ?? null,
    body,
    // AI 巡检启用 = 先审后放（pending，判定通过才 approved）；禁用 = 直接放出。
    status,
    createdAt: now,
    updatedAt: now
  }).run()
  return { id, busName: key, routeName: input.routeName, body, status, createdAt: now }
}

export function countBusMoments(client: DatabaseClient, busName: string): number {
  return client.db
    .select({ count: sql<number>`count(*)` })
    .from(busMoments)
    .where(and(eq(busMoments.busName, normalizeBusName(busName)), eq(busMoments.status, 'approved')))
    .get()?.count ?? 0
}
