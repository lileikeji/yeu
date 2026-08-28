import { randomUUID } from 'node:crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { PlaceReviewStatus } from '../../../shared/constants/server'
import type { DatabaseClient } from '../../database/client'
import { placeAmapRatings, placeReviews, users } from '../../database/schema'
import type { AppUserIdentity } from '../../utils/user-auth'

export const AMAP_RATING_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const PUBLIC_REVIEWS_LIMIT = 5

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
  userId: string
  username: string
  displayName: string
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
  user: AppUserIdentity
) {
  const existing = client.db.select({ id: placeReviews.id })
    .from(placeReviews)
    .where(and(
      eq(placeReviews.userId, user.id),
      eq(placeReviews.placeId, input.placeId)
    ))
    .get()
  if (existing) {
    reviewConflictError()
  }

  const now = Date.now()
  const id = randomUUID()
  try {
    client.db.insert(placeReviews).values({
      id,
      placeId: input.placeId,
      userId: user.id,
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
    displayName: string
    createdAt: number
  },
  currentUserId: string | null
): PublicPlaceReviewView {
  return {
    id: row.id,
    placeId: row.placeId,
    score: row.score,
    content: row.content,
    displayName: row.displayName,
    createdAt: new Date(row.createdAt).toISOString(),
    mine: currentUserId !== null
  }
}

export function getFreshAmapRating(
  client: DatabaseClient,
  placeId: string
): PlaceAmapRatingView | null {
  const row = client.db.select()
    .from(placeAmapRatings)
    .where(eq(placeAmapRatings.placeId, placeId))
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
  currentUserId: string | null = null
): PublicPlaceReviewsPayload {
  const rows = client.db.select({
    id: placeReviews.id,
    placeId: placeReviews.placeId,
    score: placeReviews.score,
    content: placeReviews.content,
    displayName: users.displayName,
    createdAt: placeReviews.createdAt
  }).from(placeReviews)
    .innerJoin(users, eq(placeReviews.userId, users.id))
    .where(and(
      eq(placeReviews.placeId, placeId),
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
      eq(placeReviews.placeId, placeId),
      eq(placeReviews.status, 'approved')
    ))
    .get()

  let mine: { submitted: boolean, status: PlaceReviewStatus | null }
    = { submitted: false, status: null }
  if (currentUserId) {
    const mineRow = client.db.select({ status: placeReviews.status })
      .from(placeReviews)
      .where(and(
        eq(placeReviews.placeId, placeId),
        eq(placeReviews.userId, currentUserId)
      ))
      .get()
    if (mineRow) {
      mine = { submitted: true, status: mineRow.status }
    }
  }

  return {
    placeId,
    amap: getFreshAmapRating(client, placeId),
    aggregate: aggregateRow && aggregateRow.count > 0
      ? { score: aggregateRow.score, count: aggregateRow.count }
      : null,
    reviews: rows.map(row => toPublicReviewView(row, currentUserId)),
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
    .innerJoin(users, eq(placeReviews.userId, users.id))
    .where(where)
    .orderBy(desc(placeReviews.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all()

  return {
    items: rows as AdminPlaceReviewView[],
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
