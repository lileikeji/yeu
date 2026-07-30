import { randomUUID } from 'node:crypto'
import { and, asc, count, countDistinct, desc, eq, gte, like, lt, max, or, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { VISITOR_COOKIE_NAME } from '../../../shared/constants/security'
import type { DatabaseClient } from '../../database/client'
import { visitorBans, visitorEvents, visitors } from '../../database/schema'
import { getClientIpAddress } from '../../utils/client-ip'
import { resolveGeoLocation } from '../../utils/geoip'
import { getSecurityConfig } from '../../utils/security'
import { safeMetadata } from '../../utils/serializers'

const VISITOR_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function setVisitorCookie(event: H3Event, visitorId: string): void {
  const security = getSecurityConfig(event)
  setCookie(event, VISITOR_COOKIE_NAME, visitorId, {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    secure: security.secureCookies,
    maxAge: 60 * 60 * 24 * 400
  })
}

export function readVisitorId(event: H3Event): string | null {
  const raw = getCookie(event, VISITOR_COOKIE_NAME)
  if (!raw || !VISITOR_ID_RE.test(raw)) return null
  return raw
}

export function ensureVisitor(
  event: H3Event,
  client: DatabaseClient,
  options: { userId?: string | null; path?: string | null } = {}
): { id: string; isNew: boolean } {
  const now = Date.now()
  const ip = getClientIpAddress(event)
  const geo = resolveGeoLocation(event, ip)
  const userAgent = (getHeader(event, 'user-agent') || '').slice(0, 400)
  const pathValue = options.path ?? getRequestURL(event).pathname
  let visitorId = readVisitorId(event)
  let isNew = false

  if (visitorId) {
    const existing = client.db.select({ id: visitors.id }).from(visitors)
      .where(eq(visitors.id, visitorId))
      .get()
    if (!existing) visitorId = null
  }

  if (!visitorId) {
    visitorId = randomUUID()
    isNew = true
    client.db.insert(visitors).values({
      id: visitorId,
      firstSeenAt: now,
      lastSeenAt: now,
      lastIp: ip,
      lastCountry: geo.country,
      lastRegion: geo.region,
      lastCity: geo.city,
      lastUserAgent: userAgent || null,
      lastPath: pathValue,
      eventCount: 0,
      userId: options.userId ?? null,
      createdAt: now,
      updatedAt: now
    }).run()
  } else {
    const visitorPatch: Record<string, unknown> = {
      lastSeenAt: now,
      lastIp: ip,
      lastCountry: geo.country,
      lastRegion: geo.region,
      lastCity: geo.city,
      lastUserAgent: userAgent || null,
      lastPath: pathValue,
      updatedAt: now
    }
    if (options.userId !== undefined) {
      visitorPatch.userId = options.userId
    }
    client.db.update(visitors).set(visitorPatch as never).where(eq(visitors.id, visitorId)).run()
  }

  setVisitorCookie(event, visitorId)
  return { id: visitorId, isNew }
}

export function recordVisitorEvent(
  event: H3Event,
  client: DatabaseClient,
  input: {
    action: string
    path?: string | null
    meta?: Record<string, unknown>
    userId?: string | null
  }
): { visitorId: string; eventId: string } {
  const visitor = ensureVisitor(event, client, {
    userId: input.userId ?? null,
    path: input.path ?? null
  })
  const now = Date.now()
  const ip = getClientIpAddress(event)
  const geo = resolveGeoLocation(event, ip)
  const eventId = randomUUID()
  const userAgent = (getHeader(event, 'user-agent') || '').slice(0, 400)
  const pathValue = input.path ?? getRequestURL(event).pathname

  client.db.transaction((tx) => {
    tx.insert(visitorEvents).values({
      id: eventId,
      visitorId: visitor.id,
      userId: input.userId ?? null,
      ip,
      country: geo.country,
      region: geo.region,
      city: geo.city,
      userAgent: userAgent || null,
      path: pathValue,
      method: getMethod(event).toUpperCase(),
      action: input.action,
      metaJson: JSON.stringify(input.meta ?? {}),
      createdAt: now
    }).run()
    const eventVisitorPatch: Record<string, unknown> = {
      eventCount: sql`${visitors.eventCount} + 1`,
      lastSeenAt: now,
      lastIp: ip,
      lastCountry: geo.country,
      lastRegion: geo.region,
      lastCity: geo.city,
      lastUserAgent: userAgent || null,
      lastPath: pathValue,
      updatedAt: now
    }
    if (input.userId !== undefined) {
      eventVisitorPatch.userId = input.userId
    }
    tx.update(visitors).set(eventVisitorPatch as never).where(eq(visitors.id, visitor.id)).run()
  })

  return { visitorId: visitor.id, eventId }
}

export function findActiveBan(
  client: DatabaseClient,
  params: { ip?: string | null; visitorId?: string | null; userId?: string | null }
) {
  const now = Date.now()
  const conditions = []
  if (params.ip) conditions.push(and(eq(visitorBans.scope, 'ip'), eq(visitorBans.value, params.ip)))
  if (params.visitorId) conditions.push(and(eq(visitorBans.scope, 'visitor'), eq(visitorBans.value, params.visitorId)))
  if (params.userId) conditions.push(and(eq(visitorBans.scope, 'user'), eq(visitorBans.value, params.userId)))
  if (!conditions.length) return null

  const rows = client.db.select().from(visitorBans)
    .where(and(
      eq(visitorBans.isActive, true),
      or(...conditions)
    ))
    .all()

  return rows.find(row => !row.expiresAt || row.expiresAt > now) ?? null
}

export function assertNotBanned(
  event: H3Event,
  client: DatabaseClient,
  options: { userId?: string | null } = {}
): void {
  const ip = getClientIpAddress(event)
  const visitorId = readVisitorId(event)
  const ban = findActiveBan(client, {
    ip,
    visitorId,
    userId: options.userId ?? null
  })
  if (!ban) return
  throw createError({
    statusCode: 403,
    statusMessage: 'Access denied',
    data: {
      code: 'VISITOR_BANNED',
      reason: ban.reason || 'banned'
    }
  })
}

export function listVisitors(
  client: DatabaseClient,
  query: {
    page: number
    pageSize: number
    q?: string
    ip?: string
    banned?: 'true' | 'false'
    sort?: 'last-seen' | 'first-seen' | 'event-count'
  }
) {
  const offset = (query.page - 1) * query.pageSize
  const conditions = []
  if (query.ip) conditions.push(eq(visitors.lastIp, query.ip))
  if (query.q) {
    const likeValue = `%${query.q}%`
    conditions.push(or(
      like(visitors.lastIp, likeValue),
      like(visitors.lastCity, likeValue),
      like(visitors.lastRegion, likeValue),
      like(visitors.lastPath, likeValue),
      like(visitors.id, likeValue)
    ))
  }

  const orderBy = query.sort === 'first-seen'
    ? [asc(visitors.firstSeenAt), asc(visitors.lastSeenAt)]
    : query.sort === 'event-count'
      ? [desc(visitors.eventCount), desc(visitors.lastSeenAt)]
      : [desc(visitors.lastSeenAt)]

  let rows = client.db.select().from(visitors)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(...orderBy)
    .all()

  const now = Date.now()
  const activeBans = client.db.select().from(visitorBans)
    .where(eq(visitorBans.isActive, true))
    .all()
    .filter(row => !row.expiresAt || row.expiresAt > now)
  const bannedVisitorIds = new Set(
    activeBans.filter(row => row.scope === 'visitor').map(row => row.value)
  )
  const bannedIps = new Set(
    activeBans.filter(row => row.scope === 'ip').map(row => row.value)
  )
  const bannedUserIds = new Set(
    activeBans.filter(row => row.scope === 'user').map(row => row.value)
  )
  const isBanned = (row: typeof rows[number]) =>
    bannedVisitorIds.has(row.id)
    || (row.lastIp ? bannedIps.has(row.lastIp) : false)
    || (row.userId ? bannedUserIds.has(row.userId) : false)

  if (query.banned === 'true' || query.banned === 'false') {
    rows = rows.filter(row => query.banned === 'true' ? isBanned(row) : !isBanned(row))
  }

  const total = rows.length
  const pageRows = rows.slice(offset, offset + query.pageSize)
  return {
    items: pageRows.map(row => ({
      id: row.id,
      firstSeenAt: new Date(row.firstSeenAt).toISOString(),
      lastSeenAt: new Date(row.lastSeenAt).toISOString(),
      lastIp: row.lastIp,
      lastCountry: row.lastCountry,
      lastRegion: row.lastRegion,
      lastCity: row.lastCity,
      lastUserAgent: row.lastUserAgent,
      lastPath: row.lastPath,
      eventCount: row.eventCount,
      userId: row.userId,
      isBanned: isBanned(row),
      locationLabel: [row.lastCountry, row.lastRegion, row.lastCity].filter(Boolean).join(' · ') || '未知'
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    analytics: buildVisitorAnalytics(client)
  }
}

function chinaDateParts(timestamp: number): { year: string; month: string; day: string; hour: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(timestamp))
  const get = (type: string): string => parts.find(item => item.type === type)?.value ?? ''
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') }
}

function chinaDayKey(timestamp: number): string {
  const parts = chinaDateParts(timestamp)
  return `${parts.year}-${parts.month}-${parts.day}`
}

function chinaDayStart(timestamp: number): number {
  return Date.parse(`${chinaDayKey(timestamp)}T00:00:00+08:00`)
}

function buildVisitorAnalytics(client: DatabaseClient) {
  const now = Date.now()
  const todayStart = chinaDayStart(now)
  const periodStart = todayStart - (13 * 24 * 60 * 60 * 1000)
  const rows = client.db.select({
    visitorId: visitorEvents.visitorId,
    createdAt: visitorEvents.createdAt
  }).from(visitorEvents).where(and(
    gte(visitorEvents.createdAt, periodStart),
    lt(visitorEvents.createdAt, now + 1)
  )).all()

  const daily = new Map<string, { eventCount: number; visitors: Set<string> }>()
  for (let index = 0; index < 14; index += 1) {
    const timestamp = todayStart - ((13 - index) * 24 * 60 * 60 * 1000)
    daily.set(chinaDateParts(timestamp).year + '-' + chinaDateParts(timestamp).month + '-' + chinaDateParts(timestamp).day, {
      eventCount: 0,
      visitors: new Set<string>()
    })
  }
  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    hour: String(hour).padStart(2, '0'),
    eventCount: 0,
    visitors: new Set<string>()
  }))

  for (const row of rows) {
    if (!row.createdAt) continue
    const parts = chinaDateParts(Number(row.createdAt))
    const day = `${parts.year}-${parts.month}-${parts.day}`
    const dayBucket = daily.get(day)
    if (dayBucket) {
      dayBucket.eventCount += 1
      dayBucket.visitors.add(row.visitorId)
    }
    if (Number(row.createdAt) >= todayStart) {
      const hourBucket = hourly[Number(parts.hour)]
      if (hourBucket) {
        hourBucket.eventCount += 1
        hourBucket.visitors.add(row.visitorId)
      }
    }
  }

  const todayBucket = daily.get(chinaDayKey(now)) ?? { eventCount: 0, visitors: new Set<string>() }
  const moduleKey = sql<string>`json_extract(${visitorEvents.metaJson}, '$.moduleKey')`
  const moduleName = sql<string>`json_extract(${visitorEvents.metaJson}, '$.moduleName')`
  const moduleViews = client.db.select({
    moduleKey,
    moduleName,
    viewCount: count(),
    visitorCount: countDistinct(visitorEvents.visitorId),
    lastViewedAt: max(visitorEvents.createdAt)
  }).from(visitorEvents)
    .where(and(
      eq(visitorEvents.action, 'module_view'),
      sql`${moduleKey} is not null`
    ))
    .groupBy(moduleKey, moduleName)
    .orderBy(desc(count()))
    .limit(100)
    .all()

  return {
    timeZone: 'Asia/Shanghai',
    date: chinaDayKey(now),
    today: {
      eventCount: todayBucket.eventCount,
      visitorCount: todayBucket.visitors.size
    },
    hourly: hourly.map(bucket => ({
      hour: bucket.hour,
      label: `${bucket.hour}:00`,
      eventCount: bucket.eventCount,
      visitorCount: bucket.visitors.size
    })),
    daily: [...daily.entries()].map(([date, bucket]) => ({
      date,
      eventCount: bucket.eventCount,
      visitorCount: bucket.visitors.size
    })),
    moduleViews: moduleViews.map(row => ({
      moduleKey: row.moduleKey,
      moduleName: row.moduleName || row.moduleKey,
      viewCount: row.viewCount,
      visitorCount: row.visitorCount,
      lastViewedAt: row.lastViewedAt ? new Date(Number(row.lastViewedAt)).toISOString() : null
    }))
  }
}

export function listVisitorEvents(
  client: DatabaseClient,
  visitorId: string,
  query: { page: number; pageSize: number }
) {
  const offset = (query.page - 1) * query.pageSize
  const rows = client.db.select().from(visitorEvents)
    .where(eq(visitorEvents.visitorId, visitorId))
    .orderBy(desc(visitorEvents.createdAt))
    .limit(query.pageSize)
    .offset(offset)
    .all()
  const total = client.db.select({ value: count() }).from(visitorEvents)
    .where(eq(visitorEvents.visitorId, visitorId))
    .get()?.value ?? 0
  return {
    items: rows.map(row => ({
      id: row.id,
      visitorId: row.visitorId,
      userId: row.userId,
      ip: row.ip,
      country: row.country,
      region: row.region,
      city: row.city,
      path: row.path,
      method: row.method,
      action: row.action,
      meta: safeMetadata(row.metaJson),
      createdAt: new Date(row.createdAt).toISOString()
    })),
    total,
    page: query.page,
    pageSize: query.pageSize
  }
}

export function createVisitorBan(
  client: DatabaseClient,
  input: {
    scope: 'ip' | 'visitor' | 'user'
    value: string
    reason?: string
    expiresAt?: string | null
    bannedByAdminId: string | null
  }
) {
  const now = Date.now()
  const id = randomUUID()
  client.db.insert(visitorBans).values({
    id,
    scope: input.scope,
    value: input.value,
    reason: input.reason?.trim() || '',
    isActive: true,
    bannedByAdminId: input.bannedByAdminId,
    expiresAt: input.expiresAt ? Date.parse(input.expiresAt) : null,
    createdAt: now,
    updatedAt: now
  }).run()
  return id
}

export function listVisitorBans(
  client: DatabaseClient,
  query: {
    page: number
    pageSize: number
    active?: 'true' | 'false' | 'all'
    scope?: 'ip' | 'visitor' | 'user'
    q?: string
  }
) {
  const offset = (query.page - 1) * query.pageSize
  const conditions = []
  if (query.active === 'true') conditions.push(eq(visitorBans.isActive, true))
  if (query.active === 'false') conditions.push(eq(visitorBans.isActive, false))
  if (query.scope) conditions.push(eq(visitorBans.scope, query.scope))
  if (query.q?.trim()) {
    const needle = `%${query.q.trim()}%`
    conditions.push(or(
      like(visitorBans.value, needle),
      like(visitorBans.reason, needle)
    ))
  }
  const where = conditions.length ? and(...conditions) : undefined
  const rows = client.db.select().from(visitorBans)
    .where(where)
    .orderBy(desc(visitorBans.createdAt))
    .limit(query.pageSize)
    .offset(offset)
    .all()
  const total = client.db.select({ value: count() }).from(visitorBans).where(where).get()?.value ?? 0
  return {
    items: rows.map(row => ({
      id: row.id,
      scope: row.scope,
      value: row.value,
      reason: row.reason,
      isActive: row.isActive,
      bannedByAdminId: row.bannedByAdminId ?? null,
      expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null
    })),
    total,
    page: query.page,
    pageSize: query.pageSize
  }
}

export function deactivateVisitorBan(client: DatabaseClient, banId: string): boolean {
  const now = Date.now()
  const result = client.db.update(visitorBans).set({
    isActive: false,
    updatedAt: now
  }).where(eq(visitorBans.id, banId)).run()
  return (result.changes ?? 0) > 0
}
