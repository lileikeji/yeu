import { randomUUID } from 'node:crypto'
import type { DatabaseClient } from '../../database/client'

/** 官网口径的匿名访客 cookie：只用来算 UV，不含任何身份信息。 */
export const POPULARITY_VISIT_COOKIE = 'yeu_pv'

const VISITOR_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const BOT_PATTERN = /bot\b|crawler|spider|headlesschrome|phantomjs|puppeteer|playwright|curl\/|wget\/|python-requests|python-urllib|aiohttp|httpx\/|go-http-client|node-fetch|undici|okhttp|scrapy|slurp/i

/** 浏览器识别顺序有意义：微信/QQ 的 UA 里同时含 Chrome 和 Safari，必须先命中。 */
const BROWSER_PATTERNS: Array<[string, RegExp]> = [
  ['微信', /MicroMessenger\/([\d.]+)/i],
  ['企业微信', /wxwork\/([\d.]+)/i],
  ['QQ', /MQQBrowser\/([\d.]+)/i],
  ['QQ', /QQ\/([\d.]+)/i],
  ['UC', /UCBrowser\/([\d.]+)/i],
  ['夸克', /Quark\/([\d.]+)/i],
  ['小米浏览器', /MiuiBrowser\/([\d.]+)/i],
  ['华为浏览器', /HuaweiBrowser\/([\d.]+)/i],
  ['vivo 浏览器', /VivoBrowser\/([\d.]+)/i],
  ['OPPO 浏览器', /HeyTapBrowser\/([\d.]+)/i],
  ['魅族浏览器', /MZBrowser\/([\d.]+)/i],
  ['百度', /(?:baiduboxapp|baidubrowser|BIDUBrowser)[/ ]?([\d.]*)/i],
  ['360', /(?:QihooBrowser|QHBrowser|360SE|360EE)[/ ]?([\d.]*)/i],
  ['搜狗', /SogouMobileBrowser\/([\d.]+)/i],
  ['三星浏览器', /SamsungBrowser\/([\d.]+)/i],
  ['Edge', /Edg(?:A|iOS)?\/([\d.]+)/i],
  ['Opera', /OPR\/([\d.]+)/i],
  ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/i],
  ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/i],
  ['Safari', /Version\/([\d.]+)[\d.)\s]*Safari/i]
]

const BRAND_PATTERNS: Array<[string, RegExp]> = [
  ['华为', /huawei|honor|\b(?:ELS|ANA|NOH|ALN|LIO|VOG|JAD|PGT|BVL|FNE|BAL|BLK|ADA|MNA)-/i],
  ['荣耀', /honor/i],
  ['小米', /xiaomi|redmi|\bmi\s?\d|\bmix\b|poco/i],
  ['OPPO', /oppo|\b(?:P[A-Z]{2,3}\d{2,4}|CPH\d{4}|PH[KM]\d{2})\b/i],
  ['vivo', /vivo|\biqoo\b|\bV\d{4}[A-Z]?\b/i],
  ['一加', /oneplus|\b(?:NE|IN|LE|KB|CPH)\d{4}\b/i],
  ['realme', /realme|\bRMX\d{4}\b/i],
  ['魅族', /meizu|\bM\d{3,4}\b/i],
  ['三星', /samsung|\bSM-[A-Z]\d{3}/i],
  ['联想', /lenovo/i],
  ['摩托罗拉', /motorola|\bmoto\b/i],
  ['中兴', /zte|nubia/i],
  ['索尼', /sony|\bXQ-[A-Z]/i],
  ['苹果', /iphone|ipad|ipod/i]
]

export interface PopularityUserAgentInfo {
  isBot: boolean
  isWechat: boolean
  browserName: string
  browserVersion: string
  osName: string
  osVersion: string
  deviceBrand: string
  deviceModel: string
}

function cleanText(value: string | null | undefined, maxLength: number): string {
  if (!value) return ''
  return Array.from(value)
    .filter(character => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127)
    .join('')
    .trim()
    .slice(0, maxLength)
}

/** 从 UA 里拆出可读的设备/系统/浏览器，后台要的就是这三列。 */
export function parsePopularityUserAgent(userAgent: string | null | undefined): PopularityUserAgentInfo {
  const ua = (userAgent || '').trim()
  if (!ua) {
    return {
      isBot: true,
      isWechat: false,
      browserName: '未知',
      browserVersion: '',
      osName: '未知',
      osVersion: '',
      deviceBrand: '',
      deviceModel: ''
    }
  }

  let browserName = '其他'
  let browserVersion = ''
  for (const [name, pattern] of BROWSER_PATTERNS) {
    const match = pattern.exec(ua)
    if (!match) continue
    browserName = name
    browserVersion = match[1] || ''
    break
  }

  let osName = '其他'
  let osVersion = ''
  let deviceModel = ''
  if (/HarmonyOS/i.test(ua)) {
    osName = '鸿蒙'
    osVersion = /HarmonyOS\s*([\d.]+)/i.exec(ua)?.[1] || ''
  } else if (/Android/i.test(ua)) {
    osName = 'Android'
    osVersion = /Android\s*([\d.]+)/i.exec(ua)?.[1] || ''
    // UA 里 Android 后面是「语言; 型号 Build/xxx; ...」，语言与 wv 不是型号。
    const segments = (/Android[\s\d.]*;(.*)$/i.exec(ua)?.[1] || '')
      .split(';')
      .map(segment => segment.replace(/\s*Build\/.*$/i, '').trim())
    deviceModel = segments.find(segment => segment && !/^(?:[a-z]{2}[-_][a-z]{2}|u|wv|mobile|tablet)$/i.test(segment)) || ''
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    osName = 'iOS'
    osVersion = (/(?:OS)\s(\d+(?:_\d+)*)/i.exec(ua)?.[1] || '').replace(/_/g, '.')
    deviceModel = /iPad/i.test(ua) ? 'iPad' : 'iPhone'
  } else if (/Windows NT/i.test(ua)) {
    osName = 'Windows'
    osVersion = /Windows NT ([\d.]+)/i.exec(ua)?.[1] || ''
  } else if (/Mac OS X/i.test(ua)) {
    osName = 'macOS'
    osVersion = (/(?:Mac OS X)\s(\d+(?:_\d+)*)/i.exec(ua)?.[1] || '').replace(/_/g, '.')
  } else if (/Linux/i.test(ua)) {
    osName = 'Linux'
  }

  const brandKey = `${deviceModel} ${ua}`
  let deviceBrand = ''
  for (const [name, pattern] of BRAND_PATTERNS) {
    if (pattern.test(brandKey)) {
      deviceBrand = name
      break
    }
  }
  if (!deviceModel && deviceBrand === '苹果') deviceModel = 'iPhone'
  if (!deviceModel) deviceModel = osName === 'Windows' ? '电脑' : osName === 'macOS' ? 'Mac' : ''

  return {
    isBot: BOT_PATTERN.test(ua),
    isWechat: /MicroMessenger/i.test(ua),
    browserName,
    browserVersion,
    osName,
    osVersion,
    deviceBrand,
    deviceModel: deviceModel.slice(0, 80)
  }
}

/** 读取（或补发）匿名访客 cookie，返回用于 UV 去重的标识。 */
export function resolvePopularityVisitorKey(existing: string | null | undefined, issue: (key: string) => void): string {
  const value = (existing || '').trim()
  if (VISITOR_KEY_RE.test(value)) return value
  const key = randomUUID()
  issue(key)
  return key
}

export interface PopularityVisitInput {
  eventId: string
  page: string
  source: string
  hasTicket: boolean
  ip: string
  country?: string
  region?: string
  city?: string
  userAgent: string
  referer?: string
  visitorKey: string
  now?: number
}

let pruneCounter = 0
const VISIT_RETENTION_DAYS = 90

/** 写一条访问记录。埋点是旁路，任何异常都吞掉，不能让看页面失败。 */
export function recordPopularityVisit(client: DatabaseClient, input: PopularityVisitInput): void {
  try {
    const info = parsePopularityUserAgent(input.userAgent)
    const createdAt = input.now ?? Date.now()
    client.sqlite.prepare(`
      INSERT INTO competition_popularity_visits (
        id, event_id, page, source, ip, country, region, city, user_agent,
        device_brand, device_model, os_name, os_version, browser_name, browser_version,
        is_wechat, is_bot, has_ticket, visitor_key, referer, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      input.eventId,
      cleanText(input.page, 16) || 'vote',
      cleanText(input.source, 16) || 'direct',
      cleanText(input.ip, 64),
      cleanText(input.country, 40),
      cleanText(input.region, 60),
      cleanText(input.city, 60),
      cleanText(input.userAgent, 512),
      info.deviceBrand,
      info.deviceModel,
      info.osName,
      info.osVersion,
      info.browserName,
      info.browserVersion,
      info.isWechat ? 1 : 0,
      info.isBot ? 1 : 0,
      input.hasTicket ? 1 : 0,
      cleanText(input.visitorKey, 64),
      cleanText(input.referer, 512),
      createdAt
    )

    pruneCounter += 1
    if (pruneCounter % 128 === 1) {
      const cutoff = createdAt - VISIT_RETENTION_DAYS * 24 * 60 * 60 * 1000
      client.sqlite.prepare('DELETE FROM competition_popularity_visits WHERE created_at < ? LIMIT 500').run(cutoff)
    }
  } catch {
    // 记录失败不影响主流程。
  }
}

/** 记一条新关注；同一 openid 重复关注只留第一次，避免取关再关注把数字刷高。 */
export function recordPopularityFollow(client: DatabaseClient, input: {
  eventId: string
  voterOpenidHash: string
  ip?: string
  userAgent?: string
  now?: number
}): void {
  try {
    client.sqlite.prepare(`
      INSERT OR IGNORE INTO competition_popularity_follows (
        id, event_id, voter_openid_hash, ip, user_agent, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      input.eventId,
      input.voterOpenidHash,
      cleanText(input.ip, 64),
      cleanText(input.userAgent, 512),
      input.now ?? Date.now()
    )
  } catch {
    // 统计失败不影响关注回复。
  }
}

export type PopularityVisitRange = 'today' | '24h' | '7d' | '30d' | 'all'

const RANGE_MS: Record<Exclude<PopularityVisitRange, 'all'>, number> = {
  today: 24 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000
}

export interface PopularityVisitRow {
  id: string
  createdAt: number
  page: string
  source: string
  hasTicket: boolean
  ip: string
  locationLabel: string
  deviceLabel: string
  deviceBrand: string
  deviceModel: string
  osLabel: string
  browserLabel: string
  isWechat: boolean
  isBot: boolean
  referer: string
  userAgent: string
}

function dayStart(now: number): number {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function locationLabel(country: string, region: string, city: string): string {
  const parts = [country, region, city].filter(part => part && part !== '未知')
  return parts.length ? parts.join(' · ') : '未知'
}

export interface PopularityVisitQuery {
  range?: string
  source?: string
  onlyWechat?: boolean
  q?: string
  page?: number
  pageSize?: number
}

/**
 * 后台「投票页访问」：概览 + 明细一次拉齐。
 * 累计口径不受 range 影响（总访问量是运营最常看的数），range 只筛明细与区间统计。
 */
export function getPopularityVisitReport(client: DatabaseClient, eventId: string, query: PopularityVisitQuery = {}) {
  const range: PopularityVisitRange = query.range === 'today' || query.range === '7d' || query.range === '30d' || query.range === '24h' || query.range === 'all'
    ? query.range
    : 'today'
  const now = Date.now()
  const today = dayStart(now)
  const since = range === 'all' ? 0 : range === 'today' ? today : now - RANGE_MS[range]
  const page = Math.max(1, Math.trunc(Number(query.page) || 1))
  const pageSize = Math.max(10, Math.min(200, Math.trunc(Number(query.pageSize) || 50)))
  const source = query.source === 'wechat' || query.source === 'direct' || query.source === 'miniapp' ? query.source : ''
  const keyword = cleanText(query.q, 120)

  const where: string[] = ['event_id = ?', 'created_at >= ?']
  const params: Array<string | number> = [eventId, since]
  if (source) {
    where.push('source = ?')
    params.push(source)
  }
  if (query.onlyWechat === true) where.push('has_ticket = 1')
  if (keyword) {
    where.push('(ip LIKE ? OR device_model LIKE ? OR user_agent LIKE ? OR browser_name LIKE ?)')
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
  }
  const whereSql = `WHERE ${where.join(' AND ')}`

  const rangeTotals = client.sqlite.prepare(`
    SELECT
      count(*) AS pv,
      count(DISTINCT CASE WHEN visitor_key <> '' THEN visitor_key END) AS uv,
      sum(CASE WHEN has_ticket = 1 THEN 1 ELSE 0 END) AS ticketPv,
      sum(CASE WHEN source = 'direct' THEN 1 ELSE 0 END) AS directPv,
      sum(CASE WHEN source = 'miniapp' THEN 1 ELSE 0 END) AS miniappPv,
      sum(CASE WHEN is_wechat = 1 THEN 1 ELSE 0 END) AS wechatUaPv,
      sum(CASE WHEN is_bot = 1 THEN 1 ELSE 0 END) AS botPv
    FROM competition_popularity_visits ${whereSql}
  `).get(...params) as {
    pv: number | null
    uv: number | null
    ticketPv: number | null
    directPv: number | null
    miniappPv: number | null
    wechatUaPv: number | null
    botPv: number | null
  }

  const totals = client.sqlite.prepare(`
    SELECT
      count(*) AS pv,
      count(DISTINCT CASE WHEN visitor_key <> '' THEN visitor_key END) AS uv,
      sum(CASE WHEN has_ticket = 1 THEN 1 ELSE 0 END) AS ticketPv
    FROM competition_popularity_visits WHERE event_id = ?
  `).get(eventId) as { pv: number | null, uv: number | null, ticketPv: number | null }

  const todayTotals = client.sqlite.prepare(`
    SELECT count(*) AS pv, sum(CASE WHEN has_ticket = 1 THEN 1 ELSE 0 END) AS ticketPv
    FROM competition_popularity_visits WHERE event_id = ? AND created_at >= ?
  `).get(eventId, today) as { pv: number | null, ticketPv: number | null }

  const followTotals = client.sqlite.prepare(`
    SELECT count(*) AS total, sum(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS today
    FROM competition_popularity_follows WHERE event_id = ?
  `).get(today, eventId) as { total: number | null, today: number | null }

  const voteTotals = client.sqlite.prepare(`
    SELECT
      sum(CASE WHEN voided = 0 AND quarantined = 0 THEN 1 ELSE 0 END) AS valid,
      sum(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS today
    FROM competition_popularity_ballots WHERE event_id = ?
  `).get(today, eventId) as { valid: number | null, today: number | null }

  const topDevices = client.sqlite.prepare(`
    SELECT device_brand AS brand, device_model AS model, count(*) AS hits,
           count(DISTINCT CASE WHEN visitor_key <> '' THEN visitor_key END) AS visitors
    FROM competition_popularity_visits ${whereSql}
    GROUP BY brand, model
    ORDER BY hits DESC
    LIMIT 10
  `).all(...params) as Array<{ brand: string, model: string, hits: number, visitors: number }>

  const topBrowsers = client.sqlite.prepare(`
    SELECT browser_name AS name, os_name AS os, count(*) AS hits
    FROM competition_popularity_visits ${whereSql}
    GROUP BY name, os
    ORDER BY hits DESC
    LIMIT 8
  `).all(...params) as Array<{ name: string, os: string, hits: number }>

  const totalRows = client.sqlite.prepare(`SELECT count(*) AS total FROM competition_popularity_visits ${whereSql}`)
    .get(...params) as { total: number }

  const rowsRaw = client.sqlite.prepare(`
    SELECT id, created_at AS createdAt, page, source, has_ticket AS hasTicket, ip,
           country, region, city, user_agent AS userAgent,
           device_brand AS deviceBrand, device_model AS deviceModel,
           os_name AS osName, os_version AS osVersion,
           browser_name AS browserName, browser_version AS browserVersion,
           is_wechat AS isWechat, is_bot AS isBot, referer
    FROM competition_popularity_visits ${whereSql}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, (page - 1) * pageSize) as Array<{
    id: string
    createdAt: number
    page: string
    source: string
    hasTicket: number
    ip: string
    country: string
    region: string
    city: string
    userAgent: string
    deviceBrand: string
    deviceModel: string
    osName: string
    osVersion: string
    browserName: string
    browserVersion: string
    isWechat: number
    isBot: number
    referer: string
  }>

  const rows: PopularityVisitRow[] = rowsRaw.map(row => ({
    id: row.id,
    createdAt: row.createdAt,
    page: row.page,
    source: row.source,
    hasTicket: Boolean(row.hasTicket),
    ip: row.ip || '未知',
    locationLabel: locationLabel(row.country, row.region, row.city),
    deviceBrand: row.deviceBrand,
    deviceModel: row.deviceModel,
    deviceLabel: [row.deviceBrand, row.deviceModel].filter(Boolean).join(' ') || '未知设备',
    osLabel: [row.osName, row.osVersion].filter(Boolean).join(' '),
    browserLabel: [row.browserName, row.browserVersion].filter(Boolean).join(' '),
    isWechat: Boolean(row.isWechat),
    isBot: Boolean(row.isBot),
    referer: row.referer,
    userAgent: row.userAgent
  }))

  const follows = followTotals.total ?? 0
  const validVotes = voteTotals.valid ?? 0

  return {
    range,
    retentionDays: VISIT_RETENTION_DAYS,
    summary: {
      visitsAll: totals.pv ?? 0,
      visitorsAll: totals.uv ?? 0,
      ticketVisitsAll: totals.ticketPv ?? 0,
      visitsToday: todayTotals.pv ?? 0,
      ticketVisitsToday: todayTotals.ticketPv ?? 0,
      followsAll: follows,
      followsToday: followTotals.today ?? 0,
      votesAll: validVotes,
      votesToday: voteTotals.today ?? 0,
      followRate: (totals.pv ?? 0) > 0 ? Math.round((follows / (totals.pv ?? 1)) * 100) : 0,
      rangePv: rangeTotals.pv ?? 0,
      rangeUv: rangeTotals.uv ?? 0,
      rangeTicketPv: rangeTotals.ticketPv ?? 0,
      rangeDirectPv: rangeTotals.directPv ?? 0,
      rangeMiniappPv: rangeTotals.miniappPv ?? 0,
      rangeWechatUaPv: rangeTotals.wechatUaPv ?? 0,
      rangeBotPv: rangeTotals.botPv ?? 0,
      topDevices: topDevices.map(row => ({
        label: [row.brand, row.model].filter(Boolean).join(' ') || '未知设备',
        hits: row.hits,
        visitors: row.visitors
      })),
      topBrowsers: topBrowsers.map(row => ({
        label: [row.name, row.os].filter(Boolean).join(' · ') || '未知',
        hits: row.hits
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
