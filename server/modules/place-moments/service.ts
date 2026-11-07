import { randomUUID } from 'node:crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import { createError } from 'h3'
import type { DatabaseClient } from '../../database/client'
import { placeMoments, users } from '../../database/schema'

export const PLACE_MOMENTS_LIMIT = 20
export const MOMENT_BODY_MAX = 300
export const MOMENT_IMAGE_MAX = 3

export interface CreatePlaceMomentInput {
  placeId: string
  kind: 'comment' | 'checkin'
  body: string
  images: string[]
}

export interface PlaceMomentView {
  id: string
  kind: 'comment' | 'checkin'
  body: string
  images: string[]
  displayName: string
  createdAt: string
  dayKey: string
}

export interface PlaceMomentsPayload {
  placeId: string
  moments: PlaceMomentView[]
  checkins: number
  checkedInToday: boolean
  /** 当前访客在此地点最新一条留言的审核状态（null = 没发过）；先审后放的轮询据此热刷新。 */
  mine: { status: 'pending' | 'approved' | 'rejected' | null }
}

const IMAGE_URL = /^\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:png|jpg|webp)$/i

/**
 * 地点 id 归一化：地图里同一条目可能带 `amap-native-` 前缀，评价那边已经踩过一次
 * （见 place-reviews 的 normalizePlaceId），留言和打卡要走同一套规则，否则同一栋楼
 * 会出现两串留言。
 */
export function normalizeMomentPlaceId(placeId: string): string {
  const trimmed = placeId.trim()
  const native = trimmed.match(/^amap-native-(.+)$/)
  return native ? native[1]! : trimmed
}

/** 本地日期键（Asia/Shanghai），打卡按天去重。 */
export function momentDayKey(now = Date.now()): string {
  const shanghai = new Date(now + 8 * 60 * 60 * 1000)
  return shanghai.toISOString().slice(0, 10)
}

export function sanitizeMomentImages(images: string[]): string[] {
  const seen: string[] = []
  for (const url of images) {
    const trimmed = url.trim()
    if (!IMAGE_URL.test(trimmed)) continue
    if (seen.includes(trimmed)) continue
    seen.push(trimmed)
    if (seen.length >= MOMENT_IMAGE_MAX) break
  }
  return seen
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

function displayNameOf(userId: string | null, nickname: string | null): string {
  if (nickname && nickname.trim()) return nickname.trim().slice(0, 12)
  if (userId) return '同学'
  return '访客'
}

export function listPlaceMoments(
  client: DatabaseClient,
  placeId: string,
  identity: { userId?: string, anonymousKey?: string }
): PlaceMomentsPayload {
  const key = normalizeMomentPlaceId(placeId)
  const rows = client.db
    .select({
      id: placeMoments.id,
      kind: placeMoments.kind,
      body: placeMoments.body,
      images: placeMoments.images,
      createdAt: placeMoments.createdAt,
      dayKey: placeMoments.dayKey,
      userId: placeMoments.userId,
      anonymousKey: placeMoments.anonymousKey,
      nickname: users.displayName
    })
    .from(placeMoments)
    .leftJoin(users, eq(placeMoments.userId, users.id))
    .where(and(eq(placeMoments.placeId, key), eq(placeMoments.status, 'approved')))
    .orderBy(desc(placeMoments.createdAt))
    .limit(PLACE_MOMENTS_LIMIT)
    .all()

  const total = client.db
    .select({ count: sql<number>`count(*)` })
    .from(placeMoments)
    .where(and(
      eq(placeMoments.placeId, key),
      eq(placeMoments.kind, 'checkin'),
      eq(placeMoments.status, 'approved')
    ))
    .get()

  const today = momentDayKey()
  const checkedInToday = rows.some(row => row.kind === 'checkin'
    && row.dayKey === today
    && (identity.userId ? row.userId === identity.userId : row.anonymousKey === identity.anonymousKey))

  // 自己最新一条（不限 status）：先审后放的前端轮询据此判断过审/被拒。
  const mineRow = identity.userId || identity.anonymousKey
    ? client.db
        .select({ status: placeMoments.status })
        .from(placeMoments)
        .where(and(
          eq(placeMoments.placeId, key),
          identity.userId
            ? eq(placeMoments.userId, identity.userId)
            : eq(placeMoments.anonymousKey, identity.anonymousKey!)
        ))
        .orderBy(desc(placeMoments.createdAt))
        .get()
    : undefined

  return {
    placeId: placeId.trim(),
    moments: rows.map(row => ({
      id: row.id,
      kind: row.kind,
      body: row.body,
      images: parseImages(row.images),
      displayName: displayNameOf(row.userId, row.nickname),
      createdAt: new Date(row.createdAt ?? Date.now()).toISOString(),
      dayKey: row.dayKey
    })),
    checkins: total?.count ?? 0,
    checkedInToday,
    mine: { status: mineRow?.status ?? null }
  }
}

export function createPlaceMoment(
  client: DatabaseClient,
  input: CreatePlaceMomentInput,
  identity: { userId?: string, anonymousKey?: string },
  ip?: string | null,
  /** AI 巡检启用时文字留言先 pending（判定通过才放出）；禁用/缺省时直接 approved。打卡无文本不走 AI，始终 approved。 */
  aiEnabled?: boolean
) {
  const identityKey = identity.userId ?? identity.anonymousKey
  if (!identityKey) throw new Error('MOMENT_IDENTITY_REQUIRED')
  const key = normalizeMomentPlaceId(input.placeId)
  const body = input.body.trim().slice(0, MOMENT_BODY_MAX)
  const images = sanitizeMomentImages(input.images)
  if (input.kind === 'comment' && !body && images.length === 0) {
    throw createError({ statusCode: 422, statusMessage: 'Comment is empty', data: { code: 'MOMENT_EMPTY' } })
  }
  // U+FFFD = 客户端编码错乱的替换符（见 bus-moments 同款校验）。
  if (body.includes('�')) {
    throw createError({ statusCode: 422, statusMessage: '内容包含无法识别的字符，请检查输入法或客户端编码', data: { code: 'MOMENT_ENCODING' } })
  }
  const now = Date.now()
  const dayKey = momentDayKey(now)

  if (input.kind === 'checkin') {
    // 同一个人同一天同一个地点只算一次。唯一索引只挡匿名的（NULL 在 SQLite 里互不相等），
    // 登录用户这条得在代码里挡。
    const existing = client.db
      .select({ id: placeMoments.id })
      .from(placeMoments)
      .where(and(
        eq(placeMoments.placeId, key),
        eq(placeMoments.kind, 'checkin'),
        eq(placeMoments.dayKey, dayKey),
        identity.userId
          ? eq(placeMoments.userId, identity.userId)
          : eq(placeMoments.anonymousKey, identity.anonymousKey!)
      ))
      .get()
    if (existing) {
      throw createError({
        statusCode: 409,
        statusMessage: '今天已打过卡，等审核通过后展示',
        data: { code: 'MOMENT_ALREADY_CHECKED_IN' }
      })
    }
  }

  const id = randomUUID()
  client.db.insert(placeMoments).values({
    id,
    placeId: key,
    userId: identity.userId ?? null,
    anonymousKey: identity.anonymousKey ?? null,
    ip: ip ?? null,
    kind: input.kind,
    body,
    images: JSON.stringify(images),
    dayKey,
    // AI 巡检启用时全部先审后放（打卡可能带文字，同样可能违规）；禁用 = 直接放出。
    status: aiEnabled ? 'pending' as const : 'approved' as const,
    createdAt: now
  }).run()

  const status = aiEnabled ? 'pending' as const : 'approved' as const
  return { id, placeId: key, kind: input.kind, body, images, dayKey, status, createdAt: now }
}
