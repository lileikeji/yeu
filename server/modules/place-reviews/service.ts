import { randomUUID } from 'node:crypto'
import { recordVisitorEvent } from '../visitors/service'
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm'
import type { PlaceReviewStatus } from '../../../shared/constants/server'
import type { DatabaseClient } from '../../database/client'
import { placeAmapRatings, placeMerchants, placeReviews, reviewLikes, users, visitorEvents } from '../../database/schema'

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
  source: 'user' | 'seed'
  sourcePlatform: 'dianping' | 'meituan' | null
  likeCount: number
  likedByMe: boolean
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
  /** Number of rewritten seed reviews for this place (excluded from aggregate). */
  seedCount: number
  /** Merchant promotion info (Meituan jump link) when enabled by the backoffice. */
  promo: { meituanUrl: string | null, promoWeight: number, aiFrequency: number } | null
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
  source: 'user' | 'seed' | 'original'
  sourceUrl: string | null
  sourcePlatform: 'dianping' | 'meituan' | null
  collectedAt: number | null
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
    source: 'user' | 'seed'
    sourcePlatform: 'dianping' | 'meituan' | null
    createdAt: number
  },
  currentIdentity: { userId?: string, anonymousKey?: string } | null,
  likeStats: { likeCount: number, likedByMe: boolean }
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
    displayName: row.displayName ?? (row.source === 'seed' ? '系统整理' : '匿名同学'),
    createdAt: new Date(row.createdAt).toISOString(),
    mine,
    source: row.source,
    sourcePlatform: row.sourcePlatform,
    likeCount: likeStats.likeCount,
    likedByMe: likeStats.likedByMe
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
  currentIdentity: { userId?: string, anonymousKey?: string } | null = null,
  sort: 'newest' | 'hot' = 'newest'
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
    source: placeReviews.source,
    sourcePlatform: placeReviews.sourcePlatform,
    createdAt: placeReviews.createdAt
  }).from(placeReviews)
    .leftJoin(users, eq(placeReviews.userId, users.id))
    .where(and(
      eq(placeReviews.placeId, key),
      eq(placeReviews.status, 'approved'),
      // 前台只展示整理卡(seed)与学生评价(user)；抓取的原文评论(original)
      // 仅供后台查看，不在前台列表混入。
      or(
        eq(placeReviews.source, 'seed'),
        eq(placeReviews.source, 'user')
      )
    ))
    .orderBy(desc(placeReviews.createdAt))
    .limit(PUBLIC_REVIEWS_LIMIT)
    .all()

  // Aggregate score counts STUDENT reviews only; rewritten seed reviews are
  // listed separately so a batch of 5-star seeds cannot skew the average.
  const aggregateRow = client.db.select({
    score: sql<number>`cast(round(avg(${placeReviews.score}) * 10) / 10 as real)`,
    count: sql<number>`count(*)`
  }).from(placeReviews)
    .where(and(
      eq(placeReviews.placeId, key),
      eq(placeReviews.status, 'approved'),
      eq(placeReviews.source, 'user')
    ))
    .get()

  const seedCountRow = client.db.select({
    count: sql<number>`count(*)`
  }).from(placeReviews)
    .where(and(
      eq(placeReviews.placeId, key),
      eq(placeReviews.status, 'approved'),
      eq(placeReviews.source, 'seed')
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

  const reviewIds = rows.map(row => row.id)
  const likeStats = resolveReviewLikes(client, reviewIds, currentIdentity?.userId ?? null)
  const reviews = rows.map(row => toPublicReviewView(
    row,
    currentIdentity,
    likeStats.get(row.id) ?? { likeCount: 0, likedByMe: false }
  ))
  if (sort === 'hot') {
    reviews.sort((a, b) => b.likeCount - a.likeCount || b.createdAt.localeCompare(a.createdAt))
  }

  return {
    placeId: key,
    amap: getFreshAmapRating(client, key),
    aggregate: aggregateRow && aggregateRow.count > 0
      ? { score: aggregateRow.score, count: aggregateRow.count }
      : null,
    reviews,
    mine,
    seedCount: Number(seedCountRow?.count ?? 0),
    promo: publicMerchantPromo(client, key)
  }
}

function resolveReviewLikes(
  client: DatabaseClient,
  reviewIds: string[],
  currentUserId: string | null
): Map<string, { likeCount: number, likedByMe: boolean }> {
  const stats = new Map<string, { likeCount: number, likedByMe: boolean }>()
  if (reviewIds.length === 0) return stats
  const countRows = client.db.select({
    reviewId: reviewLikes.reviewId,
    count: sql<number>`count(*)`
  }).from(reviewLikes)
    .where(inArray(reviewLikes.reviewId, reviewIds))
    .groupBy(reviewLikes.reviewId)
    .all()
  for (const row of countRows) {
    stats.set(row.reviewId, { likeCount: Number(row.count), likedByMe: false })
  }
  if (currentUserId) {
    const likedRows = client.db.select({ reviewId: reviewLikes.reviewId })
      .from(reviewLikes)
      .where(and(
        eq(reviewLikes.userId, currentUserId),
        inArray(reviewLikes.reviewId, reviewIds)
      ))
      .all()
    for (const row of likedRows) {
      const stat = stats.get(row.reviewId) ?? { likeCount: 0, likedByMe: false }
      stat.likedByMe = true
      stats.set(row.reviewId, stat)
    }
  }
  return stats
}

export function setReviewLike(
  client: DatabaseClient,
  reviewId: string,
  userId: string,
  liked: boolean
): { liked: boolean, likeCount: number } {
  const existing = client.db.select({ id: placeReviews.id })
    .from(placeReviews)
    .where(eq(placeReviews.id, reviewId))
    .get()
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Review not found',
      data: { code: 'REVIEW_NOT_FOUND' }
    })
  }
  if (liked) {
    client.db.insert(reviewLikes).values({ reviewId, userId, createdAt: Date.now() })
      .onConflictDoNothing()
      .run()
  } else {
    client.db.delete(reviewLikes).where(and(
      eq(reviewLikes.reviewId, reviewId),
      eq(reviewLikes.userId, userId)
    )).run()
  }
  const countRow = client.db.select({ count: sql<number>`count(*)` })
    .from(reviewLikes)
    .where(eq(reviewLikes.reviewId, reviewId))
    .get()
  return { liked, likeCount: Number(countRow?.count ?? 0) }
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
    source: placeReviews.source,
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
      // Seed rows (rewritten third-party reviews) show as 系统整理.
      username: row.username ?? null,
      displayName: row.displayName ?? (row.source === 'seed' ? '系统整理' : '匿名评价')
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

/* ------------------------------------------------------------------ */
/* 商家管理（后台）——按商家聚合评分与评论，展示完整原始评论，并可编辑  */
/* 整理卡。原始抓取评论以 source='original' 入库（全文原文），前台仅  */
/* 展示 source='seed' 的整理卡；后台可同时查看两者。                    */
/* ------------------------------------------------------------------ */

export interface AdminMerchantSummary {
  placeId: string
  poiName: string | null
  amapScore: number | null
  amapCost: number | null
  amapExpired: boolean
  seedCardCount: number
  originalReviewCount: number
  userReviewCount: number
  seedAvgScore: number | null
  originalAvgScore: number | null
}

export function adminListPlaceMerchants(client: DatabaseClient): AdminMerchantSummary[] {
  const now = Date.now()
  const ratings = client.db.select().from(placeAmapRatings).all()
  const ratingByName = new Map(ratings.map(r => [r.placeId, r]))
  const placeIds = new Set(ratings.map(r => r.placeId))

  // 聚合评论（按 place_id + source 分组）
  const reviewRows = client.db.select({
    placeId: placeReviews.placeId,
    source: placeReviews.source,
    score: placeReviews.score,
    count: sql<number>`count(*)`
  }).from(placeReviews)
    .groupBy(placeReviews.placeId, placeReviews.source)
    .all()

  const summaries = new Map<string, AdminMerchantSummary>()
  for (const row of reviewRows) {
    const existing = summaries.get(row.placeId) ?? {
      placeId: row.placeId,
      poiName: ratingByName.get(row.placeId)?.amapPoiName ?? null,
      amapScore: ratingByName.get(row.placeId)?.score ?? null,
      amapCost: ratingByName.get(row.placeId)?.cost ?? null,
      amapExpired: (ratingByName.get(row.placeId)?.expiresAt ?? 0) <= now,
      seedCardCount: 0,
      originalReviewCount: 0,
      userReviewCount: 0,
      seedAvgScore: null,
      originalAvgScore: null
    }
    if (row.source === 'seed') {
      existing.seedCardCount = Number(row.count)
      existing.seedAvgScore = row.score
    } else if (row.source === 'original') {
      existing.originalReviewCount = Number(row.count)
      existing.originalAvgScore = row.score
    } else {
      existing.userReviewCount = Number(row.count)
    }
    summaries.set(row.placeId, existing)
  }

  // 有评分但无评论的商家也列出（评分数据本身有价值）
  for (const rating of ratings) {
    if (!summaries.has(rating.placeId)) {
      summaries.set(rating.placeId, {
        placeId: rating.placeId,
        poiName: rating.amapPoiName,
        amapScore: rating.score,
        amapCost: rating.cost,
        amapExpired: rating.expiresAt <= now,
        seedCardCount: 0,
        originalReviewCount: 0,
        userReviewCount: 0,
        seedAvgScore: null,
        originalAvgScore: null
      })
    }
  }

  void placeIds
  return [...summaries.values()]
    .sort((left, right) => (right.amapScore ?? 0) - (left.amapScore ?? 0))
}

export interface AdminMerchantDetail {
  placeId: string
  poiName: string | null
  amapScore: number | null
  amapCost: number | null
  amapExpired: boolean
  seedCards: AdminPlaceReviewView[]
  originalReviews: AdminPlaceReviewView[]
  userReviews: AdminPlaceReviewView[]
}

export function adminGetPlaceMerchantDetail(
  client: DatabaseClient,
  placeId: string
): AdminMerchantDetail | null {
  const rating = client.db.select().from(placeAmapRatings)
    .where(eq(placeAmapRatings.placeId, placeId)).get()
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
    source: placeReviews.source,
    sourceUrl: placeReviews.sourceUrl,
    sourcePlatform: placeReviews.sourcePlatform,
    collectedAt: placeReviews.collectedAt,
    reviewNote: placeReviews.reviewNote,
    reviewedAt: placeReviews.reviewedAt,
    createdAt: placeReviews.createdAt,
    updatedAt: placeReviews.updatedAt
  }).from(placeReviews)
    .leftJoin(users, eq(placeReviews.userId, users.id))
    .where(eq(placeReviews.placeId, placeId))
    .orderBy(desc(placeReviews.createdAt))
    .all()

  if (rows.length === 0 && !rating) return null

  const toView = (row: typeof rows[number]): AdminPlaceReviewView => ({
    ...row,
    username: row.username ?? null,
    displayName: row.displayName ?? (row.source === 'seed' ? '系统整理' : row.source === 'original' ? '平台原文' : '匿名评价'),
    sourceUrl: row.sourceUrl ?? null,
    sourcePlatform: row.sourcePlatform ?? null,
    collectedAt: row.collectedAt ?? null
  }) as unknown as AdminPlaceReviewView

  const seedCards = rows.filter(r => r.source === 'seed').map(toView)
  const originalReviews = rows.filter(r => r.source === 'original').map(toView)
  const userReviews = rows.filter(r => r.source === 'user').map(toView)

  return {
    placeId,
    poiName: rating?.amapPoiName ?? null,
    amapScore: rating?.score ?? null,
    amapCost: rating?.cost ?? null,
    amapExpired: (rating?.expiresAt ?? 0) <= Date.now(),
    seedCards,
    originalReviews,
    userReviews
  }
}

export function adminUpdateSeedReview(
  client: DatabaseClient,
  id: string,
  input: { content?: string, score?: number },
  adminId: string
): AdminPlaceReviewView {
  const now = Date.now()
  const existing = client.db.select({
    id: placeReviews.id,
    source: placeReviews.source
  }).from(placeReviews).where(eq(placeReviews.id, id)).get()
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Review not found',
      data: { code: 'REVIEW_NOT_FOUND' }
    })
  }
  if (existing.source !== 'seed') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Only seed cards can be edited',
      data: { code: 'NOT_SEED_REVIEW' }
    })
  }

  const set: Record<string, unknown> = { updatedAt: now }
  if (input.content !== undefined) set.content = input.content.trim()
  if (input.score !== undefined) {
    const score = Number(input.score)
    if (!Number.isFinite(score) || score < 1 || score > 5) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Score must be between 1 and 5',
        data: { code: 'INVALID_SCORE' }
      })
    }
    set.score = score
  }

  const row = client.db.update(placeReviews).set(set)
    .where(eq(placeReviews.id, id))
    .returning({
      id: placeReviews.id,
      placeId: placeReviews.placeId,
      userId: placeReviews.userId,
      anonymousKey: placeReviews.anonymousKey,
      score: placeReviews.score,
      content: placeReviews.content,
      status: placeReviews.status,
      source: placeReviews.source,
      sourceUrl: placeReviews.sourceUrl,
      sourcePlatform: placeReviews.sourcePlatform,
      collectedAt: placeReviews.collectedAt,
      reviewNote: placeReviews.reviewNote,
      reviewedAt: placeReviews.reviewedAt,
      createdAt: placeReviews.createdAt,
      updatedAt: placeReviews.updatedAt
    }).get()

  return {
    ...row,
    username: null,
    displayName: '系统整理'
  } as unknown as AdminPlaceReviewView
}

/** 后台创建整理卡（source='seed'，前台展示用）。 */
export function adminCreateSeedReview(
  client: DatabaseClient,
  input: { placeId: string, score: number, content: string, sourcePlatform?: 'dianping' | 'meituan' }
): AdminPlaceReviewView {
  const key = normalizePlaceId(input.placeId)
  if (input.score < 1 || input.score > 5) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Score must be between 1 and 5',
      data: { code: 'INVALID_SCORE' }
    })
  }
  const now = Date.now()
  const id = randomUUID()
  client.db.insert(placeReviews).values({
    id,
    placeId: key,
    userId: null,
    anonymousKey: `seed-admin-${id.slice(0, 12)}`,
    score: input.score,
    content: input.content.trim(),
    status: 'approved',
    source: 'seed',
    sourcePlatform: input.sourcePlatform ?? null,
    collectedAt: now,
    createdAt: now,
    updatedAt: now
  }).run()
  return {
    id,
    placeId: key,
    userId: null,
    anonymousKey: null,
    username: null,
    displayName: '系统整理',
    score: input.score,
    content: input.content.trim(),
    status: 'approved',
    source: 'seed',
    sourceUrl: null,
    sourcePlatform: input.sourcePlatform ?? null,
    collectedAt: now,
    reviewNote: null,
    reviewedAt: now,
    createdAt: now,
    updatedAt: now
  } as unknown as AdminPlaceReviewView
}

/** 后台删除评论（整理卡或原文）。 */
export function adminDeleteReview(client: DatabaseClient, id: string): void {
  const existing = client.db.select({ id: placeReviews.id }).from(placeReviews)
    .where(eq(placeReviews.id, id)).get()
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Review not found',
      data: { code: 'REVIEW_NOT_FOUND' }
    })
  }
  client.db.delete(placeReviews).where(eq(placeReviews.id, id)).run()
}

/* ------------------------------------------------------------------ */
/* 商家推广设置：美团跳转链接、排行占比（promo_weight）、AI 出现频率    */
/* ------------------------------------------------------------------ */

export interface MerchantPromoView {
  placeId: string
  meituanUrl: string | null
  promoWeight: number
  aiFrequency: number
  enabled: boolean
  /** Outbound Meituan jump clicks recorded via visitor_events (7 / 30 days). */
  clickCount7d: number
  clickCount30d: number
}

export function getMerchantPromo(client: DatabaseClient, placeId: string): MerchantPromoView {
  const row = client.db.select().from(placeMerchants)
    .where(eq(placeMerchants.placeId, placeId)).get()
  const now = Date.now()
  const week = now - 7 * 24 * 60 * 60 * 1000
  const month = now - 30 * 24 * 60 * 60 * 1000
  return {
    placeId,
    meituanUrl: row?.meituanUrl ?? null,
    promoWeight: row?.promoWeight ?? 0,
    aiFrequency: row?.aiFrequency ?? 0,
    enabled: row?.enabled ?? false,
    clickCount7d: row ? countPromoClicks(client, placeId, week) : 0,
    clickCount30d: row ? countPromoClicks(client, placeId, month) : 0
  }
}

/** Count outbound promo clicks in visitor_events for one place since a time. */
function countPromoClicks(client: DatabaseClient, placeId: string, sinceMs: number): number {
  const row = client.db.select({ count: sql<number>`count(*)` })
    .from(visitorEvents)
    .where(and(
      eq(visitorEvents.action, 'merchant_promo_click'),
      sql`json_extract(${visitorEvents.metaJson}, '$.placeId') = ${placeId}`,
      sql`${visitorEvents.createdAt} >= ${sinceMs}`
    ))
    .get()
  return Number(row?.count ?? 0)
}

/** Record an outbound Meituan jump click from the map popup (visitor-level). */
export function recordPromoClick(
  client: DatabaseClient,
  event: import('h3').H3Event,
  placeId: string
): void {
  recordVisitorEvent(event, client, {
    action: 'merchant_promo_click',
    path: '/map',
    meta: { placeId }
  })
}

export function updateMerchantPromo(
  client: DatabaseClient,
  placeId: string,
  input: { meituanUrl?: string | null, promoWeight?: number, aiFrequency?: number, enabled?: boolean }
): MerchantPromoView {
  const now = Date.now()
  const existing = client.db.select({ placeId: placeMerchants.placeId }).from(placeMerchants)
    .where(eq(placeMerchants.placeId, placeId)).get()

  if (input.meituanUrl !== undefined && input.meituanUrl !== null) {
    const url = input.meituanUrl.trim()
    if (url && !/^https?:\/\//i.test(url)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Meituan URL must start with http(s)://',
        data: { code: 'INVALID_MEITUAN_URL' }
      })
    }
    input.meituanUrl = url || null
  }
  if (input.promoWeight !== undefined) {
    if (input.promoWeight < 0 || input.promoWeight > 100) {
      throw createError({
        statusCode: 400,
        statusMessage: 'promoWeight must be 0-100',
        data: { code: 'INVALID_PROMO_WEIGHT' }
      })
    }
  }
  if (input.aiFrequency !== undefined) {
    if (input.aiFrequency < 0 || input.aiFrequency > 100) {
      throw createError({
        statusCode: 400,
        statusMessage: 'aiFrequency must be 0-100',
        data: { code: 'INVALID_AI_FREQUENCY' }
      })
    }
  }

  if (existing) {
    const set: Record<string, unknown> = { updatedAt: now }
    if (input.meituanUrl !== undefined) set.meituanUrl = input.meituanUrl
    if (input.promoWeight !== undefined) set.promoWeight = input.promoWeight
    if (input.aiFrequency !== undefined) set.aiFrequency = input.aiFrequency
    if (input.enabled !== undefined) set.enabled = input.enabled
    client.db.update(placeMerchants).set(set).where(eq(placeMerchants.placeId, placeId)).run()
  } else {
    client.db.insert(placeMerchants).values({
      placeId,
      meituanUrl: input.meituanUrl ?? null,
      promoWeight: input.promoWeight ?? 0,
      aiFrequency: input.aiFrequency ?? 0,
      enabled: input.enabled ?? false,
      updatedAt: now
    }).run()
  }
  return getMerchantPromo(client, placeId)
}

/** 公开详情附加推广信息（地图弹窗/AI 用）——enabled 且有关联时才暴露。 */
export function publicMerchantPromo(client: DatabaseClient, placeId: string): {
  meituanUrl: string | null
  promoWeight: number
  aiFrequency: number
} | null {
  const row = client.db.select().from(placeMerchants)
    .where(and(
      eq(placeMerchants.placeId, placeId),
      eq(placeMerchants.enabled, true)
    )).get()
  if (!row) return null
  const now = Date.now()
  return {
    meituanUrl: row.meituanUrl,
    promoWeight: row.promoWeight,
    aiFrequency: row.aiFrequency,
    clickCount7d: countPromoClicks(client, placeId, now - 7 * 24 * 60 * 60 * 1000),
    clickCount30d: countPromoClicks(client, placeId, now - 30 * 24 * 60 * 60 * 1000)
  }
}
