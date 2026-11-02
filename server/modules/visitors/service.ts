import { randomUUID } from 'node:crypto'
import { and, asc, count, countDistinct, desc, eq, gt, gte, inArray, isNull, like, lt, lte, max, or, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { VISITOR_COOKIE_NAME } from '../../../shared/constants/security'
import { MINIAPP_TELEMETRY_ACTIONS } from '../../../shared/schemas/server'
import type { ApiMiniappAnalytics } from '../../../shared/types/server'
import type { DatabaseClient } from '../../database/client'
import { visitorBans, visitorEvents, visitors } from '../../database/schema'
import { getClientIpAddress } from '../../utils/client-ip'
import { resolveGeoLocation } from '../../utils/geoip'
import { resolveRequestId } from '../../utils/request-context'
import { getSecurityConfig } from '../../utils/security'
import { safeMetadata } from '../../utils/serializers'

const VISITOR_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MINIAPP_TELEMETRY_ACTION_SET = new Set<string>(MINIAPP_TELEMETRY_ACTIONS)
const MINIAPP_TELEMETRY_META_KEYS = new Set([
  'platform', 'appVersion', 'source', 'scene', 'appIdHash',
  'route', 'status', 'error', 'latency', 'requestId', 'api', 'method',
  'moduleKey', 'moduleName', 'resultType',
  'entityType', 'kind', 'slug', 'id', 'placeId', 'target',
  'queryLength', 'hasQuery', 'hasPlace', 'hasCoordinate', 'success', 'map'
])
const MINIAPP_TELEMETRY_META_MAX_KEYS = 32
const MINIAPP_TELEMETRY_META_MAX_DEPTH = 4
const MINIAPP_TELEMETRY_META_MAX_JSON_CHARS = 8192
const MINIAPP_TELEMETRY_VALUE_MAX_LENGTH = 256
const MINIAPP_ANALYTICS_MAX_ROWS = 100_000
const MINIAPP_ANALYTICS_MAX_RAW_VALUES = 100
const MINIAPP_ANALYTICS_MAX_LATENCY_SAMPLES = 10_000
const MINIAPP_ANALYTICS_MAX_BUCKET_KEYS = 1_000
/** 同一访客在窗口内重复上报同一页面的 page_view 视为一次。 */
const MINIAPP_PAGE_VIEW_DEDUPE_WINDOW_MS = 30_000

function normalizeTelemetryBucket(value: unknown, maxLength = 128): string {
  if (typeof value !== 'string') return ''
  const normalized = value.trim()
  if (!normalized) return ''
  const safe = Array.from(normalized)
    .filter(character => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127)
    .join('')
  return safe.slice(0, maxLength)
}

function normalizeTelemetryRoute(value: unknown): string {
  const candidate = normalizeTelemetryBucket(value, 512)
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return ''
  return normalizeVisitorPath(candidate)
}

export function normalizeVisitorPath(path: string | null | undefined): string {
  const value = (path || '').trim()
  if (!value) return '/'
  let pathname: string
  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
      pathname = new URL(value).pathname
    } else {
      pathname = value.split(/[?#]/, 1)[0] || '/'
    }
  } catch {
    pathname = '/'
  }
  const hasControlCharacter = Array.from(pathname)
    .some(character => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)
  if (!pathname.startsWith('/') || pathname.includes('\\') || hasControlCharacter) {
    return '/'
  }
  pathname = pathname.replace(/\/+/g, '/')
  if (pathname.length > 2048) pathname = pathname.slice(0, 2048)
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') || '/' : '/'
}

function telemetryValue(value: unknown): string | number | boolean | null {
  if (typeof value === 'string') return value.trim().slice(0, MINIAPP_TELEMETRY_VALUE_MAX_LENGTH)
  if (typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(-1_000_000_000, Math.min(1_000_000_000, value))
  return null
}

function telemetryMetaDepth(value: unknown, depth = 0): number {
  if (depth > MINIAPP_TELEMETRY_META_MAX_DEPTH || value === null || typeof value !== 'object') return depth
  return Object.values(value as Record<string, unknown>)
    .reduce<number>((maxDepth, child) => Math.max(maxDepth, telemetryMetaDepth(child, depth + 1)), depth)
}

export function normalizeMiniappTelemetryMeta(
  meta: Record<string, unknown> | undefined,
  requestId?: string | null
): Record<string, string | number | boolean> {
  const output: Record<string, string | number | boolean> = {}
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    for (const [key, raw] of Object.entries(meta)) {
      if (!MINIAPP_TELEMETRY_META_KEYS.has(key) || Object.keys(output).length >= MINIAPP_TELEMETRY_META_MAX_KEYS) continue
      const value = telemetryValue(raw)
      if (value === null || value === '') continue
      output[key] = value
    }
  }
  if (requestId && !output.requestId) output.requestId = requestId.slice(0, 100)
  if (typeof output.api === 'string') {
    const route = normalizeTelemetryRoute(output.api)
    if (route) output.api = route
    else delete output.api
  }
  for (const key of ['platform', 'appVersion', 'source', 'route', 'error', 'method', 'moduleKey', 'moduleName', 'resultType', 'placeId']) {
    if (typeof output[key] === 'string') output[key] = normalizeTelemetryBucket(output[key])
  }
  let encoded = JSON.stringify(output)
  if (telemetryMetaDepth(output) > MINIAPP_TELEMETRY_META_MAX_DEPTH || encoded.length > MINIAPP_TELEMETRY_META_MAX_JSON_CHARS) {
    return Object.fromEntries(Object.entries(output).slice(0, 8))
  }
  // JSON.stringify above is deliberately kept as the final serialization boundary.
  encoded = JSON.stringify(output)
  return encoded.length <= MINIAPP_TELEMETRY_META_MAX_JSON_CHARS ? output : {}
}

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

function isSqliteContention(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED'
}

export function readVisitorId(event: H3Event): string | null {
  const raw = getCookie(event, VISITOR_COOKIE_NAME)
  if (!raw || !VISITOR_ID_RE.test(raw)) return null
  return raw
}

export function ensureVisitor(
  event: H3Event,
  client: DatabaseClient,
  options: { userId?: string | null, path?: string | null } = {}
): { id: string, isNew: boolean } {
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

  // 访客计数属于旁路统计：SQLite 被后台任务短暂写锁住时（SQLITE_BUSY），
  // 不能让公开接口跟着 500，直接把这次访问降级成「不记名访客」。
  let writable = true
  if (!visitorId) {
    visitorId = randomUUID()
    isNew = true
    try {
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
    } catch (error) {
      if (!isSqliteContention(error)) throw error
      writable = false
      isNew = false
    }
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
    try {
      client.db.update(visitors).set(visitorPatch as never).where(eq(visitors.id, visitorId)).run()
    } catch (error) {
      if (!isSqliteContention(error)) throw error
      writable = false
    }
  }

  if (writable) setVisitorCookie(event, visitorId)
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
): { visitorId: string, eventId: string } {
  const requestId = typeof event.context.requestId === 'string'
    ? event.context.requestId
    : resolveRequestId(getHeader(event, 'x-request-id'))
  event.context.requestId = requestId
  const pathValue = normalizeVisitorPath(input.path ?? getRequestURL(event).pathname)
  const telemetry = MINIAPP_TELEMETRY_ACTION_SET.has(input.action)
  const normalizedMeta = telemetry
    ? normalizeMiniappTelemetryMeta(input.meta, requestId)
    : input.meta ?? {}
  const visitor = ensureVisitor(event, client, {
    userId: input.userId ?? null,
    path: pathValue
  })
  const now = Date.now()
  const ip = getClientIpAddress(event)
  const geo = resolveGeoLocation(event, ip)
  const eventId = randomUUID()
  const userAgent = (getHeader(event, 'user-agent') || '').slice(0, 400)

  if (input.action === 'page_view') {
    const duplicate = client.db.select({ id: visitorEvents.id })
      .from(visitorEvents)
      .where(and(
        eq(visitorEvents.visitorId, visitor.id),
        eq(visitorEvents.action, 'page_view'),
        eq(visitorEvents.path, pathValue),
        gte(visitorEvents.createdAt, now - MINIAPP_PAGE_VIEW_DEDUPE_WINDOW_MS)
      ))
      .limit(1)
      .get()
    if (duplicate) return { visitorId: visitor.id, eventId: duplicate.id }
  }

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
      metaJson: JSON.stringify(normalizedMeta),
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

function summarizeUserAgent(userAgent: string | null): string {
  const value = (userAgent || '').trim()
  if (!value) return 'unknown'
  const platform = /Android/i.test(value)
    ? 'Android'
    : /iPhone|iPad|iPod/i.test(value)
      ? 'iOS'
      : /Windows/i.test(value)
        ? 'Windows'
        : /Mac OS X/i.test(value)
          ? 'macOS'
          : /Linux/i.test(value)
            ? 'Linux'
            : 'Other'
  const browser = /MicroMessenger/i.test(value)
    ? 'WeChat'
    : /MiniProgram/i.test(value)
      ? 'MiniProgram'
      : /Chrome|CriOS/i.test(value)
        ? 'Chrome'
        : /Safari/i.test(value)
          ? 'Safari'
          : /Firefox/i.test(value)
            ? 'Firefox'
            : 'Other'
  return `${platform}/${browser}`
}

export function getMiniappAnalytics(
  client: DatabaseClient,
  hours = 24,
  options: {
    includeRaw?: boolean
    includeSources?: boolean
    includeApiMetrics?: boolean
  } = {}
): ApiMiniappAnalytics {
  const now = Date.now()
  const normalizedHours = Number.isFinite(hours)
    ? Math.max(1, Math.min(720, Math.floor(hours)))
    : 24
  const since = now - normalizedHours * 60 * 60 * 1000
  const rows = client.db.select().from(visitorEvents)
    .where(and(
      gte(visitorEvents.createdAt, since),
      lte(visitorEvents.createdAt, now),
      inArray(visitorEvents.action, [...MINIAPP_TELEMETRY_ACTIONS])
    ))
    .orderBy(asc(visitorEvents.createdAt), asc(visitorEvents.id))
    .limit(MINIAPP_ANALYTICS_MAX_ROWS)
    .all()

  const parseMeta = (value: string): Record<string, unknown> => {
    try {
      const parsed: unknown = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {}
    } catch {
      return {}
    }
  }
  const pageCounts = new Map<string, { events: number, visitors: Set<string> }>()
  const eventCounts = new Map<string, { events: number, visitors: Set<string> }>()
  const sourceCounts = new Map<string, { events: number, visitors: Set<string> }>()
  const versionCounts = new Map<string, { events: number, visitors: Set<string> }>()
  const deviceCounts = new Map<string, { events: number, visitors: Set<string> }>()
  const uaCounts = new Map<string, { events: number, visitors: Set<string> }>()
  const apiRows = new Map<string, { count: number, errors: number, latencies: number[], statuses: Map<number, number> }>()
  const rawUserAgents = new Set<string>()
  const rawIps = new Set<string>()
  const add = (map: Map<string, { events: number, visitors: Set<string> }>, key: string, visitorId: string): void => {
    const normalized = key.trim()
    if (!normalized) return
    if (!map.has(normalized) && map.size >= MINIAPP_ANALYTICS_MAX_BUCKET_KEYS) return
    const current = map.get(normalized) ?? { events: 0, visitors: new Set<string>() }
    current.events += 1
    current.visitors.add(visitorId)
    map.set(normalized, current)
  }
  for (const row of rows) {
    const meta = parseMeta(row.metaJson)
    const pathname = normalizeVisitorPath(row.path)
    add(pageCounts, pathname, row.visitorId)
    add(eventCounts, row.action, row.visitorId)
    add(sourceCounts, normalizeTelemetryBucket(meta.source), row.visitorId)
    add(versionCounts, normalizeTelemetryBucket(meta.appVersion), row.visitorId)
    const platform = normalizeTelemetryBucket(meta.platform)
    add(deviceCounts, platform || summarizeUserAgent(row.userAgent), row.visitorId)
    add(uaCounts, row.userAgent ? summarizeUserAgent(row.userAgent) : 'unknown', row.visitorId)
    if (options.includeRaw) {
      if (row.userAgent && rawUserAgents.size < MINIAPP_ANALYTICS_MAX_RAW_VALUES) rawUserAgents.add(row.userAgent)
      if (row.ip && rawIps.size < MINIAPP_ANALYTICS_MAX_RAW_VALUES) rawIps.add(row.ip)
    }
    const api = normalizeTelemetryRoute(meta.api)
    if (api) {
      if (!apiRows.has(api) && apiRows.size >= MINIAPP_ANALYTICS_MAX_BUCKET_KEYS) continue
      const current = apiRows.get(api) ?? { count: 0, errors: 0, latencies: [], statuses: new Map<number, number>() }
      current.count += 1
      const status = typeof meta.status === 'number' && Number.isInteger(meta.status) && meta.status >= 100 && meta.status <= 599
        ? meta.status
        : null
      if (status !== null) current.statuses.set(status, (current.statuses.get(status) ?? 0) + 1)
      if (row.action === 'api_error' || (status !== null && status >= 400)) current.errors += 1
      const latency = typeof meta.latency === 'number' && Number.isFinite(meta.latency) && meta.latency >= 0 && meta.latency <= 120_000
        ? Math.round(meta.latency)
        : null
      if (latency !== null && current.latencies.length < MINIAPP_ANALYTICS_MAX_LATENCY_SAMPLES) current.latencies.push(latency)
      apiRows.set(api, current)
    }
  }
  const mapBuckets = (map: Map<string, { events: number, visitors: Set<string> }>) => [...map.entries()]
    .sort((a, b) => b[1].events - a[1].events || a[0].localeCompare(b[0]))
    .slice(0, 100)
    .map(([key, value]) => ({ key, events: value.events, visitors: value.visitors.size }))
  const api = [...apiRows.entries()].map(([route, value]) => {
    const sorted = [...value.latencies].sort((a, b) => a - b)
    return {
      route,
      status: value.statuses.size
        ? [...value.statuses.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0]
        : null,
      requestCount: value.count,
      errorCount: value.errors,
      latencyMs: {
        count: sorted.length,
        average: sorted.length ? Math.round(sorted.reduce((sum, item) => sum + item, 0) / sorted.length) : 0,
        p50: sorted.length
          ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.5) - 1))]!
          : null,
        p95: sorted.length
          ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1))]!
          : null,
        max: sorted.length ? sorted[sorted.length - 1]! : null
      }
    }
  }).sort((a, b) => b.requestCount - a.requestCount).slice(0, 100)
  const result: ApiMiniappAnalytics = {
    window: { hours: normalizedHours, since: new Date(since).toISOString(), until: new Date(now).toISOString() },
    totals: { events: rows.length, visitors: new Set(rows.map(row => row.visitorId)).size },
    pages: mapBuckets(pageCounts).map(item => ({ pathname: item.key, ...item })),
    events: mapBuckets(eventCounts),
    sources: options.includeSources === false ? [] : mapBuckets(sourceCounts),
    versions: mapBuckets(versionCounts),
    devices: mapBuckets(deviceCounts),
    userAgents: mapBuckets(uaCounts),
    api: options.includeApiMetrics === false ? [] : api
  }
  if (options.includeRaw) result.raw = { userAgents: [...rawUserAgents], ips: [...rawIps] }
  return result
}
export function getPublicPageViewStats(client: DatabaseClient, path: string) {
  const normalizedPath = normalizeVisitorPath(path)
  const condition = and(
    eq(visitorEvents.action, 'page_view'),
    eq(visitorEvents.path, normalizedPath)
  )
  const row = client.db.select({
    viewCount: count(),
    visitorCount: countDistinct(visitorEvents.visitorId)
  }).from(visitorEvents).where(condition).get()

  return {
    path: normalizedPath,
    viewCount: Number(row?.viewCount ?? 0),
    visitorCount: Number(row?.visitorCount ?? 0)
  }
}

export function findActiveBan(
  client: DatabaseClient,
  params: { ip?: string | null, visitorId?: string | null, userId?: string | null }
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
    analytics?: 'true' | 'false'
  }
) {
  const offset = (query.page - 1) * query.pageSize
  const conditions = []
  if (query.ip) {
    // A ban is IP-based, but a visitor may have moved on to another network.
    // Keep historical IP matches visible so the ban detail never leads to an
    // apparently empty visitor list.
    const historicalVisitorIds = client.db.select({ visitorId: visitorEvents.visitorId })
      .from(visitorEvents)
      .where(eq(visitorEvents.ip, query.ip))
      .groupBy(visitorEvents.visitorId)
      .all()
      .map(row => row.visitorId)
    const ipConditions = [eq(visitors.lastIp, query.ip)]
    if (historicalVisitorIds.length) ipConditions.push(inArray(visitors.id, historicalVisitorIds))
    conditions.push(or(...ipConditions))
  }
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
  const isBanned = (row: { id: string, lastIp: string | null, userId: string | null }) =>
    bannedVisitorIds.has(row.id)
    || (row.lastIp ? bannedIps.has(row.lastIp) : false)
    || (row.userId ? bannedUserIds.has(row.userId) : false)

  const banConditions = []
  if (bannedVisitorIds.size) banConditions.push(inArray(visitors.id, [...bannedVisitorIds]))
  if (bannedIps.size) banConditions.push(inArray(visitors.lastIp, [...bannedIps]))
  if (bannedUserIds.size) banConditions.push(inArray(visitors.userId, [...bannedUserIds]))
  const banWhere = banConditions.length ? or(...banConditions) : undefined
  if (query.banned === 'true' && !banWhere) {
    return {
      items: [], total: 0, page: query.page, pageSize: query.pageSize,
      analytics: query.analytics === 'false' ? undefined : buildVisitorAnalytics(client)
    }
  }
  if (query.banned === 'true' && banWhere) conditions.push(banWhere)

  const where = conditions.length ? and(...conditions) : undefined
  // A negative ban filter is uncommon and cannot be expressed safely with
  // nullable account/IP columns without changing its meaning. Apply it after
  // the database query. The default and banned-only views stay fully paged
  // instead of loading every visitor before slicing one page.
  let total: number
  let pageRows: Array<typeof visitors.$inferSelect>
  if (query.banned === 'false') {
    const rows = client.db.select().from(visitors)
      .where(where)
      .orderBy(...orderBy)
      .all()
      .filter(row => !isBanned(row))
    total = rows.length
    pageRows = rows.slice(offset, offset + query.pageSize)
  } else {
    total = Number(client.db.select({ value: count() }).from(visitors).where(where).get()?.value ?? 0)
    pageRows = client.db.select().from(visitors)
      .where(where)
      .orderBy(...orderBy)
      .limit(query.pageSize)
      .offset(offset)
      .all()
  }
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
    analytics: query.analytics === 'false' ? undefined : buildVisitorAnalytics(client)
  }
}

function chinaDateParts(timestamp: number): { year: string, month: string, day: string, hour: string } {
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

  const daily = new Map<string, { eventCount: number, visitors: Set<string> }>()
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
  query: { page: number, pageSize: number }
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
  const reason = input.reason?.trim() || ''
  const expiresAt = input.expiresAt ? Date.parse(input.expiresAt) : null

  // A visitor-scoped ban alone is trivially bypassed by clearing the visitor
  // cookie (a fresh visitorId is issued). Bind the visitor's most recent IP as
  // an additional IP-scoped ban so the same client stays blocked even after
  // rotating its cookie, unless that IP is already banned.
  let linkedIp: string | null = null
  if (input.scope === 'visitor') {
    const row = client.db.select({ lastIp: visitors.lastIp }).from(visitors)
      .where(eq(visitors.id, input.value))
      .get()
    const candidate = row?.lastIp?.trim() || null
    if (candidate) {
      const existingIpBan = client.db.select({ id: visitorBans.id }).from(visitorBans)
        .where(and(
          eq(visitorBans.scope, 'ip'),
          eq(visitorBans.value, candidate),
          eq(visitorBans.isActive, true)
        ))
        .get()
      if (!existingIpBan) linkedIp = candidate
    }
  }

  client.db.transaction((transaction) => {
    transaction.insert(visitorBans).values({
      id,
      scope: input.scope,
      value: input.value,
      reason,
      isActive: true,
      bannedByAdminId: input.bannedByAdminId,
      expiresAt,
      createdAt: now,
      updatedAt: now
    }).run()
    if (linkedIp) {
      transaction.insert(visitorBans).values({
        id: randomUUID(),
        scope: 'ip',
        value: linkedIp,
        reason,
        isActive: true,
        bannedByAdminId: input.bannedByAdminId,
        expiresAt,
        createdAt: now,
        updatedAt: now
      }).run()
    }
  })
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
    id?: string
  }
) {
  const offset = (query.page - 1) * query.pageSize
  const conditions = []
  const now = Date.now()
  const effectivelyActive = and(
    eq(visitorBans.isActive, true),
    or(isNull(visitorBans.expiresAt), gt(visitorBans.expiresAt, now))
  )
  const notEffectivelyActive = or(
    eq(visitorBans.isActive, false),
    and(eq(visitorBans.isActive, true), lte(visitorBans.expiresAt, now))
  )
  if (query.active === 'true') conditions.push(effectivelyActive)
  if (query.active === 'false') conditions.push(notEffectivelyActive)
  if (query.scope) conditions.push(eq(visitorBans.scope, query.scope))
  if (query.id) conditions.push(eq(visitorBans.id, query.id))
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
      isActive: Boolean(row.isActive && (!row.expiresAt || row.expiresAt > now)),
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
