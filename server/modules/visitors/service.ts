import { randomUUID } from 'node:crypto'
import { and, count, desc, eq, like, or, sql } from 'drizzle-orm'
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
  query: { page: number; pageSize: number; q?: string; ip?: string; banned?: 'true' | 'false' }
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

  let rows = client.db.select().from(visitors)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(visitors.lastSeenAt))
    .all()

  if (query.banned === 'true' || query.banned === 'false') {
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
      locationLabel: [row.lastCountry, row.lastRegion, row.lastCity].filter(Boolean).join(' · ') || '未知'
    })),
    total,
    page: query.page,
    pageSize: query.pageSize
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
  query: { page: number; pageSize: number }
) {
  const offset = (query.page - 1) * query.pageSize
  const rows = client.db.select().from(visitorBans)
    .orderBy(desc(visitorBans.createdAt))
    .limit(query.pageSize)
    .offset(offset)
    .all()
  const total = client.db.select({ value: count() }).from(visitorBans).get()?.value ?? 0
  return {
    items: rows.map(row => ({
      id: row.id,
      scope: row.scope,
      value: row.value,
      reason: row.reason,
      isActive: row.isActive,
      expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
      createdAt: new Date(row.createdAt).toISOString()
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
