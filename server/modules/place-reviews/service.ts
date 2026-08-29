import { randomUUID } from 'node:crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { PlaceReviewStatus } from '../../../shared/constants/server'
import type { DatabaseClient } from '../../database/client'
import { placeAmapRatings, placeReviews, users } from '../../database/schema'

export const AMAP_RATING_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const PUBLIC_REVIEWS_LIMIT = 5

/**
 * Normalize a place id before rating lookups. Map providers may pass native
 * AMap POI ids with the `amap-native-` UI prefix (or a hotspot synthetic id);
 * the ratings table is keyed by the bare AMap POI id (e.g. `B0M6VHJ12T`), so
 * the prefix must be stripped or the seeded rating is never found.
 */
export function normalizePlaceId(placeId: string): string {
  const trimmed = placeId.trim()
  const native = trimmed.match(/^amap-native-(.+)$/)
  if (native) return native[1]!
  return trimmed
}

export interface CreatePlaceReviewInput {
  placeId: string
  score: number
  content: string
}

export interface PublicPlaceReviewView {
  id: string
  placeId: string
  score: number
  content: string
  displayName: string
  createdAt: string
  mine: boolean
}

export interface PlaceAmapRatingView {
  poiId: string
  poiName: string
  score: number | null
  cost: number | null
  fetchedAt: string
  expiresAt: string
}

export interface PublicPlaceReviewsPayload {
  placeId: string
  amap: PlaceAmapRatingView | null
  aggregate: { score: number, count: number } | null
  reviews: PublicPlaceReviewView[]
  mine: { submitted: boolean, status: PlaceReviewStatus | null }
}

export interface AdminPlaceReviewView {
  id: string
  placeId: string
  userId: string | null
  anonymousKey: string | null
  username: string | null
  displayName: string | null
  score: number
  content: string
  status: PlaceReviewStatus
  reviewNote: string | null
  reviewedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface AdminPlaceReviewsResult {
  items: AdminPlaceReviewView[]
  total: number
  page: number
  pageSize: number
}

export interface AdminPlaceReviewsQuery {
  page?: number
  pageSize?: number
  q?: string
  status?: PlaceReviewStatus
  placeId?: string
  userId?: string
}

function reviewConflictError(): never {
  throw createError({
    statusCode: 409,
    statusMessage: 'Review already exists',
    data: { code: 'REVIEW_ALREADY_EXISTS' }
  })
}

export function createPlaceReview(
  client: DatabaseClient,
  input: CreatePlaceReviewInput,
  identity: { userId?: string, anonymousKey?: string }
) {
  const dedupeKey = identity.userId ?? identity.anonymousKey
  if (!dedupeKey) throw new Error('REVIEW_IDENTITY_REQUIRED')
  const key = normalizePlaceId(input.placeId)
  const existing = dedupeKey
    ? client.db.select({ id: placeReviews.id })
        .from(placeReviews)
        .where(and(
          identity.userId
            ? eq(placeReviews.userId, identity.userId)
            : eq(placeReviews.anonymousKey, identity.anonymousKey),
          eq(placeReviews.placeId, key)
        ))
        .get()
    : null
  if (existing) {
    reviewConflictError()
  }

  const now = Date.now()
  const id = randomUUID()
  try {
    client.db.insert(placeReviews).values({
      id,
      placeId: key,
      userId: identity.userId ?? null,
      anonymousKey: identity.anonymousKey ?? null,
      score: input.score,
      content: input.content,
      status: 'pending',
      createdAt: now,
      updatedAt: now
    }).run()
  } catch {
    reviewConflictError()
  }
  return {
    id,
    placeId: input.placeId,
    score: input.score,
    content: input.content,
    status: 'pending' as const,
    createdAt: now
  }
}

function toPublicReviewView(
  row: {
    id: string
    placeId: string
    score: number
    content: string
    displayName: string | null
    userId: string | null
    anonymousKey: string | null
    createdAt: number
  },
  currentIdentity: { userId?: string, anonymousKey?: string } | null
): PublicPlaceReviewView {
  const mine = currentIdentity !== null && (
    (row.userId !== null && row.userId === currentIdentity.userId)
    || (row.anonymousKey !== null && row.anonymousKey === currentIdentity.anonymousKey)
  )
  return {
    id: row.id,
    placeId: row.placeId,
    score: row.score,
    content: row.content,
    displayName: row.displayName ?? '匿名同学',
    createdAt: new Date(row.createdAt).toISOString(),
    mine
  }
}

export function getFreshAmapRating(
  client: DatabaseClient,
  placeId: string
): PlaceAmapRatingView | null {
  const key = normalizePlaceId(placeId)
  const row = client.db.select()
    .from(placeAmapRatings)
    .where(eq(placeAmapRatings.placeId, key))
    .get()
  if (!row || row.expiresAt <= Date.now()) return null
  return {
    poiId: row.amapPoiId,
    poiName: row.amapPoiName,
    score: row.score,
    cost: row.cost,
    fetchedAt: new Date(row.fetchedAt).toISOString(),
    expiresAt: new Date(row.expiresAt).toISOString()
  }
}

export function listPublicPlaceReviews(
  client: DatabaseClient,
  placeId: string,
  currentIdentity: { userId?: string, anonymousKey?: string } | null = null
): PublicPlaceReviewsPayload {
  const key = normalizePlaceId(placeId)
  const rows = client.db.select({
    id: placeReviews.id,
    placeId: placeReviews.placeId,
    score: placeReviews.score,
    content: placeReviews.content,
    displayName: users.displayName,
    userId: placeReviews.userId,
    anonymousKey: placeReviews.anonymousKey,
    createdAt: placeReviews.createdAt
  }).from(placeReviews)
    .leftJoin(users, eq(placeReviews.userId, users.id))
    .where(and(
      eq(placeReviews.placeId, key),
      eq(placeReviews.status, 'approved')
    ))
    .orderBy(desc(placeReviews.createdAt))
    .limit(PUBLIC_REVIEWS_LIMIT)
    .all()

  const aggregateRow = client.db.select({
    score: sql<number>`cast(round(avg(${placeReviews.score}) * 10) / 10 as real)`,
    count: sql<number>`count(*)`
  }).from(placeReviews)
    .where(and(
      eq(placeReviews.placeId, key),
      eq(placeReviews.status, 'approved')
    ))
    .get()

  let mine: { submitted: boolean, status: PlaceReviewStatus | null }
    = { submitted: false, status: null }
  if (currentIdentity?.userId || currentIdentity?.anonymousKey) {
    const mineRow = client.db.select({ status: placeReviews.status })
      .from(placeReviews)
      .where(and(
        eq(placeReviews.placeId, key),
        currentIdentity.userId
          ? eq(placeReviews.userId, currentIdentity.userId)
          : eq(placeReviews.anonymousKey, currentIdentity.anonymousKey)
      ))
      .get()
    if (mineRow) {
      mine = { submitted: true, status: mineRow.status }
    }
  }

  return {
    placeId: key,
    amap: getFreshAmapRating(client, key),
    aggregate: aggregateRow && aggregateRow.count > 0
      ? { score: aggregateRow.score, count: aggregateRow.count }
      : null,
    reviews: rows.map(row => toPublicReviewView(row, currentIdentity)),
    mine
  }
}

export function upsertAmapRating(
  client: DatabaseClient,
  placeId: string,
  rating: { poiId: string, poiName: string, score: number | null, cost: number | null }
): void {
  const now = Date.now()
  client.db.insert(placeAmapRatings).values({
    placeId,
    amapPoiId: rating.poiId,
    amapPoiName: rating.poiName,
    score: rating.score,
    cost: rating.cost,
    fetchedAt: now,
    expiresAt: now + AMAP_RATING_TTL_MS,
    createdAt: now,
    updatedAt: now
  }).onConflictDoUpdate({
    target: placeAmapRatings.placeId,
    set: {
      amapPoiId: rating.poiId,
      amapPoiName: rating.poiName,
      score: rating.score,
      cost: rating.cost,
      fetchedAt: now,
      expiresAt: now + AMAP_RATING_TTL_MS,
      updatedAt: now
    }
  }).run()
}

export interface AdminAmapRatingView {
  placeId: string
  poiId: string
  poiName: string
  score: number | null
  cost: number | null
  fetchedAt: string
  expiresAt: string
  expired: boolean
}

export function adminListAmapRatings(client: DatabaseClient): AdminAmapRatingView[] {
  const now = Date.now()
  const rows = client.db.select()
    .from(placeAmapRatings)
    .orderBy(placeAmapRatings.placeId)
    .all()
  return rows.map(row => ({
    placeId: row.placeId,
    poiId: row.amapPoiId,
    poiName: row.amapPoiName,
    score: row.score,
    cost: row.cost,
    fetchedAt: new Date(row.fetchedAt).toISOString(),
    expiresAt: new Date(row.expiresAt).toISOString(),
    expired: row.expiresAt <= now
  }))
}

export function adminListPlaceReviews(
  client: DatabaseClient,
  query: AdminPlaceReviewsQuery
): AdminPlaceReviewsResult {
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 20

  const filters: unknown[] = []
  if (query.status) filters.push(eq(placeReviews.status, query.status))
  if (query.placeId) filters.push(eq(placeReviews.placeId, query.placeId))
  if (query.userId) filters.push(eq(placeReviews.userId, query.userId))

  const where = filters.length > 0 ? and(...filters as never[]) : undefined

  const totalRow = where
    ? client.db.select({ count: sql<number>`count(*)` }).from(placeReviews).where(where).get()
    : client.db.select({ count: sql<number>`count(*)` }).from(placeReviews).get()

  const rows = client.db.select({
    id: placeReviews.id,
    placeId: placeReviews.placeId,
    userId: placeReviews.userId,
    anonymousKey: placeReviews.anonymousKey,
    username: users.username,
    displayName: users.displayName,
    score: placeReviews.score,
    content: placeReviews.content,
    status: placeReviews.status,
    reviewNote: placeReviews.reviewNote,
    reviewedAt: placeReviews.reviewedAt,
    createdAt: placeReviews.createdAt,
    updatedAt: placeReviews.updatedAt
  }).from(placeReviews)
    .leftJoin(users, eq(placeReviews.userId, users.id))
    .where(where)
    .orderBy(desc(placeReviews.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all()

  return {
    items: rows.map(row => ({
      ...row,
      // Anonymous reviews carry no user row; surface them clearly to admins.
      username: row.username ?? null,
      displayName: row.displayName ?? (row.userId ? null : '匿名评价')
    })) as unknown as AdminPlaceReviewView[],
    total: Number(totalRow?.count ?? 0),
    page,
    pageSize
  }
}

export function adminReviewPlace(
  client: DatabaseClient,
  id: string,
  input: { status: 'approved' | 'rejected', note?: string },
  adminId: string
): AdminPlaceReviewView {
  const now = Date.now()
  const row = client.db.update(placeReviews).set({
    status: input.status,
    reviewedByAdminId: adminId,
    reviewedAt: now,
    reviewNote: input.note?.trim() || null,
    updatedAt: now
  }).where(eq(placeReviews.id, id)).returning({
    id: placeReviews.id,
    placeId: placeReviews.placeId,
    userId: placeReviews.userId,
    score: placeReviews.score,
    content: placeReviews.content,
    status: placeReviews.status,
    reviewNote: placeReviews.reviewNote,
    reviewedAt: placeReviews.reviewedAt,
    createdAt: placeReviews.createdAt,
    updatedAt: placeReviews.updatedAt
  }).get()

  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Review not found',
      data: { code: 'REVIEW_NOT_FOUND' }
    })
  }

  const user = client.db.select({
    username: users.username,
    displayName: users.displayName
  }).from(users).where(eq(users.id, row.userId)).get()

  return {
    ...row,
    username: user?.username ?? '',
    displayName: user?.displayName ?? ''
  }
}
