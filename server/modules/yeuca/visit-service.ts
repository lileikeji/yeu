import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { getCookie, getHeader, getMethod, getRequestURL, setCookie } from 'h3'
import type { DatabaseClient } from '../../database/client'
import { getClientIpAddress } from '../../utils/client-ip'
import { resolveGeoLocation } from '../../utils/geoip'
import { normalizeVisitorPath } from '../visitors/service'

/** 官网埋点用的匿名访客标识，只用来算 UV，不含任何身份信息。 */
export const YEUCA_VISITOR_COOKIE = 'yeuca_vid'
/** 明细保留天数：超过就由写入路径顺手清掉，库不无限长。 */
export const YEUCA_VISIT_RETENTION_DAYS = 30
const VISITOR_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PRUNE_EVERY = 64

const BOT_SIGNATURES: Array<[string, RegExp]> = [
  ['Googlebot', /googlebot|google-inspectiontool/i],
  ['Bingbot', /bingbot|bingpreview|adidxbot/i],
  ['百度蜘蛛', /baiduspider/i],
  ['搜狗蜘蛛', /sogou\s*(web|inst|news)?\s*spider|sogou web spider/i],
  ['360 蜘蛛', /360spider|haosouspider/i],
  ['Yandex', /yandex(bot)?/i],
  ['Ahrefs', /ahrefs(bot)?/i],
  ['Semrush', /semrush(bot)?/i],
  ['MJ12', /mj12bot/i],
  ['Dotbot', /dotbot/i],
  ['PetalBot', /petalbot/i],
  ['Bytespider', /bytespider/i],
  ['GPTBot', /gptbot|chatgpt-user|oai-searchbot/i],
  ['ClaudeBot', /claudebot|claude-web/i],
  ['Common Crawl', /ccbot/i],
  ['Uptime 探针', /uptime|pingdom|statuscake|site24x7/i]
]

const SCANNER_SIGNATURES: Array<[string, RegExp]> = [
  ['curl', /^curl\//i],
  ['wget', /^wget\//i],
  ['python 脚本', /python-requests|python-urllib|aiohttp|httpx\/|python\/3/i],
  ['Java 客户端', /^java\/|apache-httpclient/i],
  ['Go 客户端', /go-http-client/i],
  ['Node 脚本', /node-fetch|undici|axios\/|got\s\(/i],
  ['okhttp', /okhttp/i],
  ['无头浏览器', /headlesschrome|phantomjs|puppeteer|playwright/i],
  ['漏扫工具', /nessus|acunetix|nikto|nuclei|wpscan|sqlmap|zgrab|masscan|nmap|dirbuster|gobuster|feroxbuster/i],
  ['通用爬虫', /bot\b|crawler|spider|scrapy|slurp/i]
]

export interface YeucaBotVerdict {
  isBot: boolean
  botName: string
  isScanner: boolean
}

/**
 * UA 判型：搜索引擎、AI 抓取、脚本客户端、漏扫工具都算非浏览器流量。
 * 先认已知爬虫再认脚本，否则 Googlebot 这种带 bot 字样的会被「通用爬虫」抢走，
 * 后台就分不清是搜索引擎还是有人在抓站。
 */
export function detectYeucaBot(userAgent: string | null | undefined): YeucaBotVerdict {
  const ua = (userAgent || '').trim()
  if (!ua) return { isBot: true, botName: '空 UA', isScanner: true }

  for (const [name, pattern] of BOT_SIGNATURES) {
    if (pattern.test(ua)) return { isBot: true, botName: name, isScanner: false }
  }
  for (const [name, pattern] of SCANNER_SIGNATURES) {
    if (pattern.test(ua)) return { isBot: true, botName: name, isScanner: true }
  }
  return { isBot: false, botName: '', isScanner: false }
}

export interface YeucaVisitInput {
  action?: string
  path: string
  method?: string
  status?: number | null
  durationMs?: number | null
  referer?: string | null
  origin?: string | null
  userAgent?: string | null
  ip?: string | null
  visitorId?: string | null
  country?: string | null
  region?: string | null
  city?: string | null
}

function text(value: string | null | undefined, maxLength: number): string {
  if (!value) return ''
  return Array.from(value)
    .filter(character => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127)
    .join('')
    .trim()
    .slice(0, maxLength)
}

let writeCounter = 0

/**
 * 写一条访问记录。埋点和接口中间件都走这里，任何异常都吞掉——
 * 记录失败不该让官网请求失败。
 */
export function recordYeucaVisit(client: DatabaseClient, input: YeucaVisitInput): void {
  try {
    const userAgent = text(input.userAgent, 512)
    const verdict = detectYeucaBot(userAgent)
    const createdAt = Date.now()
    client.sqlite.prepare(`
      INSERT INTO yeuca_visits (
        id, visitor_id, ip, country, region, city, user_agent, is_bot, bot_name,
        action, path, method, status, duration_ms, referer, origin, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      text(input.visitorId, 64),
      text(input.ip, 64),
      text(input.country, 40),
      text(input.region, 60),
      text(input.city, 60),
      userAgent,
      verdict.isBot ? 1 : 0,
      verdict.botName,
      text(input.action, 32) || 'page_view',
      normalizeVisitorPath(text(input.path, 512)),
      (text(input.method, 8) || 'GET').toUpperCase(),
      Number.isFinite(input.status) ? Math.trunc(Number(input.status)) : null,
      Number.isFinite(input.durationMs) ? Math.trunc(Number(input.durationMs)) : null,
      text(input.referer, 512),
      text(input.origin, 160),
      createdAt
    )

    writeCounter += 1
    if (writeCounter % PRUNE_EVERY === 1) {
      const cutoff = createdAt - YEUCA_VISIT_RETENTION_DAYS * 24 * 60 * 60 * 1000
      client.sqlite.prepare('DELETE FROM yeuca_visits WHERE created_at < ? LIMIT 500').run(cutoff)
    }
  } catch {
    // 记录是旁路，失败不影响主流程。
  }
}

/** 读取（或补发）访客 cookie，返回用于 UV 去重的匿名标识。 */
export function resolveYeucaVisitorId(event: H3Event): string {
  const existing = (getCookie(event, YEUCA_VISITOR_COOKIE) || '').trim()
  if (VISITOR_ID_RE.test(existing)) return existing

  const visitorId = randomUUID()
  try {
    setCookie(event, YEUCA_VISITOR_COOKIE, visitorId, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      httpOnly: true,
      sameSite: 'lax'
    })
  } catch {
    // 响应头已发出时忽略，UV 退化成按 IP 统计。
  }
  return visitorId
}

/** 中间件用：按当前请求补一条接口访问记录。 */
export function recordYeucaRequest(event: H3Event, client: DatabaseClient, detail: {
  action?: string
  status?: number | null
  durationMs?: number | null
}): void {
  const ip = getClientIpAddress(event)
  const geo = resolveGeoLocation(event, ip)
  recordYeucaVisit(client, {
    action: detail.action || 'api',
    path: getRequestURL(event).pathname,
    method: getMethod(event),
    status: detail.status ?? null,
    durationMs: detail.durationMs ?? null,
    referer: getHeader(event, 'referer') || '',
    origin: getHeader(event, 'origin') || '',
    userAgent: getHeader(event, 'user-agent') || '',
    ip,
    visitorId: (getCookie(event, YEUCA_VISITOR_COOKIE) || ''),
    country: geo.country,
    region: geo.region,
    city: geo.city
  })
}

export interface YeucaIpBanRow {
  ip: string
  reason: string
  hits: number
  isActive: boolean
  expiresAt: number | null
  createdAt: number
  updatedAt: number
}

/** 命中封禁返回 true，并把拦截次数累加，后台能看到这个 IP 被打回了多少次。 */
export function isYeucaIpBanned(client: DatabaseClient, ip: string | null | undefined): boolean {
  const value = (ip || '').trim()
  if (!value) return false
  try {
    const row = client.sqlite.prepare(`
      SELECT ip, is_active, expires_at FROM yeuca_ip_bans WHERE ip = ? LIMIT 1
    `).get(value) as { ip: string, is_active: number, expires_at: number | null } | undefined
    if (!row || !row.is_active) return false
    if (row.expires_at && row.expires_at <= Date.now()) return false
    return true
  } catch {
    return false
  }
}

export function noteYeucaIpBanHit(client: DatabaseClient, ip: string): void {
  try {
    client.sqlite.prepare('UPDATE yeuca_ip_bans SET hits = hits + 1, updated_at = ? WHERE ip = ?')
      .run(Date.now(), ip)
  } catch {
    // 统计失败不影响拦截。
  }
}

export function banYeucaIp(client: DatabaseClient, input: {
  ip: string
  reason?: string
  hours?: number | null
  adminId?: string | null
}): YeucaIpBanRow {
  const ip = text(input.ip, 64)
  if (!ip) throw new Error('缺少 IP')
  const hours = Number.isFinite(input.hours) ? Math.max(1, Math.min(24 * 365, Math.trunc(Number(input.hours)))) : 24
  const now = Date.now()
  const expiresAt = hours > 0 ? now + hours * 60 * 60 * 1000 : null
  client.sqlite.prepare(`
    INSERT INTO yeuca_ip_bans (ip, reason, hits, is_active, expires_at, banned_by_admin_id, created_at, updated_at)
    VALUES (?, ?, 0, 1, ?, ?, ?, ?)
    ON CONFLICT(ip) DO UPDATE SET
      reason = excluded.reason,
      is_active = 1,
      expires_at = excluded.expires_at,
      banned_by_admin_id = excluded.banned_by_admin_id,
      updated_at = excluded.updated_at
  `).run(ip, text(input.reason, 200), expiresAt, input.adminId || null, now, now)
  return readYeucaIpBan(client, ip)
}

export function unbanYeucaIp(client: DatabaseClient, ip: string): void {
  client.sqlite.prepare('UPDATE yeuca_ip_bans SET is_active = 0, updated_at = ? WHERE ip = ?')
    .run(Date.now(), text(ip, 64))
}

function readYeucaIpBan(client: DatabaseClient, ip: string): YeucaIpBanRow {
  const row = client.sqlite.prepare(`
    SELECT ip, reason, hits, is_active AS isActive, expires_at AS expiresAt,
           created_at AS createdAt, updated_at AS updatedAt
    FROM yeuca_ip_bans WHERE ip = ? LIMIT 1
  `).get(ip) as (Omit<YeucaIpBanRow, 'isActive'> & { isActive: boolean | number }) | undefined
  if (!row) {
    return {
      ip,
      reason: '',
      hits: 0,
      isActive: false,
      expiresAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  }
  return { ...row, isActive: Boolean(row.isActive) }
}

export type YeucaVisitRange = '24h' | '7d' | '30d'

const RANGE_MS: Record<YeucaVisitRange, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000
}

export interface YeucaVisitRow {
  id: string
  createdAt: number
  ip: string
  locationLabel: string
  action: string
  path: string
  method: string
  status: number | null
  durationMs: number | null
  userAgent: string
  botName: string
  isBot: boolean
  referer: string
  banned: boolean
}

export interface YeucaVisitQuery {
  range?: string
  ip?: string
  path?: string
  onlyBots?: boolean
  page?: number
  pageSize?: number
}

function resolveRange(value: string | undefined): YeucaVisitRange {
  return value === '7d' || value === '30d' ? value : '24h'
}

function locationLabel(country: string, region: string, city: string): string {
  const parts = [country, region, city].filter(part => part && part !== '未知')
  return parts.length ? parts.join(' · ') : '位置未知'
}

/**
 * 后台「访问记录」一次拉齐概览与明细：概览走聚合，明细分页。
 * range 只影响概览与列表的时间窗，筛选条件（IP / 路径 / 只看机器流量）同时作用于两者。
 */
export function getYeucaVisitOverview(client: DatabaseClient, query: YeucaVisitQuery = {}) {
  const range = resolveRange(query.range)
  const now = Date.now()
  const since = now - RANGE_MS[range]
  const page = Math.max(1, Math.trunc(Number(query.page) || 1))
  const pageSize = Math.max(10, Math.min(200, Math.trunc(Number(query.pageSize) || 50)))
  const ipFilter = text(query.ip, 64)
  const pathFilter = text(query.path, 200)
  const onlyBots = query.onlyBots === true

  const where: string[] = ['created_at >= ?']
  const params: Array<string | number> = [since]
  if (ipFilter) {
    where.push('ip LIKE ?')
    params.push(`%${ipFilter}%`)
  }
  if (pathFilter) {
    where.push('path LIKE ?')
    params.push(`%${pathFilter}%`)
  }
  if (onlyBots) where.push('is_bot = 1')
  const whereSql = `WHERE ${where.join(' AND ')}`

  const totals = client.sqlite.prepare(`
    SELECT
      count(*) AS hits,
      count(DISTINCT CASE WHEN ip <> '' THEN ip END) AS ips,
      count(DISTINCT CASE WHEN visitor_id <> '' THEN visitor_id END) AS visitors,
      sum(CASE WHEN is_bot = 1 THEN 1 ELSE 0 END) AS botHits,
      sum(CASE WHEN action = 'page_view' THEN 1 ELSE 0 END) AS pageViews
    FROM yeuca_visits ${whereSql}
  `).get(...params) as {
    hits: number | null
    ips: number | null
    visitors: number | null
    botHits: number | null
    pageViews: number | null
  }

  const bucketMs = range === '24h' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000
  const bucketCount = range === '24h' ? 24 : range === '7d' ? 7 : 30
  const startBucket = Math.floor(now / bucketMs) * bucketMs - (bucketCount - 1) * bucketMs
  const seriesRows = client.sqlite.prepare(`
    SELECT CAST((created_at - ?) / ? AS INTEGER) AS bucket, count(*) AS hits
    FROM yeuca_visits
    WHERE created_at >= ?
    GROUP BY bucket
  `).all(startBucket, bucketMs, startBucket) as Array<{ bucket: number, hits: number }>
  const bucketMap = new Map(seriesRows.map(row => [row.bucket, row.hits]))
  const series = Array.from({ length: bucketCount }, (_, index) => {
    const start = startBucket + index * bucketMs
    const date = new Date(start)
    const label = range === '24h'
      ? `${String(date.getHours()).padStart(2, '0')}:00`
      : `${date.getMonth() + 1}/${date.getDate()}`
    return { label, hits: bucketMap.get(index) ?? 0 }
  })

  const topPaths = client.sqlite.prepare(`
    SELECT path, count(*) AS hits,
           count(DISTINCT CASE WHEN ip <> '' THEN ip END) AS ips,
           max(created_at) AS lastAt
    FROM yeuca_visits ${whereSql}
    GROUP BY path
    ORDER BY hits DESC
    LIMIT 12
  `).all(...params) as Array<{ path: string, hits: number, ips: number, lastAt: number }>

  const topIps = client.sqlite.prepare(`
    SELECT ip, count(*) AS hits, count(DISTINCT path) AS paths, max(created_at) AS lastAt,
           max(is_bot) AS isBot, max(bot_name) AS botName,
           max(country) AS country, max(region) AS region, max(city) AS city
    FROM yeuca_visits ${whereSql} AND ip <> ''
    GROUP BY ip
    ORDER BY hits DESC
    LIMIT 20
  `).all(...params) as Array<{
    ip: string
    hits: number
    paths: number
    lastAt: number
    isBot: number
    botName: string
    country: string
    region: string
    city: string
  }>

  const burstRows = client.sqlite.prepare(`
    SELECT ip, count(*) AS hits, max(created_at) AS lastAt
    FROM yeuca_visits
    WHERE created_at >= ? AND ip <> '' AND is_bot = 1
    GROUP BY ip
    HAVING hits >= 30
    ORDER BY hits DESC
    LIMIT 10
  `).all(now - 60 * 60 * 1000) as Array<{ ip: string, hits: number, lastAt: number }>

  const banRows = client.sqlite.prepare(`
    SELECT ip, reason, hits, is_active AS isActive, expires_at AS expiresAt,
           created_at AS createdAt, updated_at AS updatedAt
    FROM yeuca_ip_bans
    WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > ?)
    ORDER BY updated_at DESC
    LIMIT 50
  `).all(now) as YeucaIpBanRow[]
  const bannedIps = new Set(banRows.map(row => row.ip))

  const totalRows = client.sqlite.prepare(`SELECT count(*) AS total FROM yeuca_visits ${whereSql}`)
    .get(...params) as { total: number }
  const rowsRaw = client.sqlite.prepare(`
    SELECT id, created_at AS createdAt, ip, country, region, city, user_agent AS userAgent,
           is_bot AS isBot, bot_name AS botName, action, path, method, status,
           duration_ms AS durationMs, referer
    FROM yeuca_visits ${whereSql}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, (page - 1) * pageSize) as Array<{
    id: string
    createdAt: number
    ip: string
    country: string
    region: string
    city: string
    userAgent: string
    isBot: number
    botName: string
    action: string
    path: string
    method: string
    status: number | null
    durationMs: number | null
    referer: string
  }>

  const rows: YeucaVisitRow[] = rowsRaw.map(row => ({
    id: row.id,
    createdAt: row.createdAt,
    ip: row.ip || '未知',
    locationLabel: locationLabel(row.country, row.region, row.city),
    action: row.action,
    path: row.path,
    method: row.method,
    status: row.status,
    durationMs: row.durationMs,
    userAgent: row.userAgent,
    botName: row.botName,
    isBot: Boolean(row.isBot),
    referer: row.referer,
    banned: bannedIps.has(row.ip)
  }))

  const hits = totals.hits ?? 0
  return {
    range,
    retentionDays: YEUCA_VISIT_RETENTION_DAYS,
    summary: {
      hits,
      pageViews: totals.pageViews ?? 0,
      browsers: hits - (totals.botHits ?? 0),
      botHits: totals.botHits ?? 0,
      botRate: hits ? Math.round(((totals.botHits ?? 0) / hits) * 100) : 0,
      ips: totals.ips ?? 0,
      visitors: totals.visitors ?? 0,
      series,
      topPaths: topPaths.map(row => ({
        path: row.path,
        hits: row.hits,
        ips: row.ips,
        lastAt: row.lastAt
      })),
      topIps: topIps.map(row => ({
        ip: row.ip,
        hits: row.hits,
        paths: row.paths,
        lastAt: row.lastAt,
        isBot: Boolean(row.isBot),
        botName: row.botName,
        locationLabel: locationLabel(row.country, row.region, row.city),
        banned: bannedIps.has(row.ip)
      })),
      bursts: burstRows.map(row => ({
        ip: row.ip,
        hits: row.hits,
        lastAt: row.lastAt,
        banned: bannedIps.has(row.ip)
      })),
      bans: banRows.map(row => ({
        ip: row.ip,
        reason: row.reason,
        hits: row.hits,
        expiresAt: row.expiresAt
      }))
    },
    rows,
    pagination: {
      page,
      pageSize,
      total: totalRows.total,
      pages: Math.max(1, Math.ceil(totalRows.total / pageSize))
    }
  }
}
