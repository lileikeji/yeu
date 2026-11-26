import { createHmac, randomBytes } from 'node:crypto'
import { getCookie, getHeader, setCookie } from 'h3'
import type { H3Event } from 'h3'

import { createOpaqueToken, hashOpaqueToken, safeEqual } from './security'

const TOKEN_PURPOSE = 'competition-popularity-token'
const DEVICE_PURPOSE = 'competition-popularity-device'
const DEVICE_TOKEN_PURPOSE = 'competition-popularity-device-token'
const PAGE_TICKET_PURPOSE = 'competition-popularity-page-ticket'
const IP_PURPOSE = 'competition-popularity-ip'
const ENV_PURPOSE = 'competition-popularity-env'
const PASSCODE_PURPOSE = 'competition-popularity-wechat-passcode'
const OPENID_PURPOSE = 'competition-popularity-openid'
const WECHAT_TICKET_PURPOSE = 'competition-popularity-wechat-ticket'
const DISPLAY_SESSION_PURPOSE = 'competition-popularity-display-session'
const DEVICE_COOKIE = 'yeu_popularity_device'
const DISPLAY_SESSION_COOKIE = 'yeu_popularity_display'

const PAGE_TICKET_TTL_MS = 30 * 60_000
const WECHAT_TICKET_TTL_MS = 45 * 60_000
const PASSCODE_WINDOW_MS = 60_000
export const POPULARITY_MIN_DWELL_MS = 400

const AUTOMATED_UA_PATTERN = /curl|wget|python-requests|python-urllib|aiohttp|httpx|go-http-client|okhttp|axios|node-fetch|undici|got\/|postmanruntime|insomnia|httpie|headlesschrome|phantomjs|playwright|puppeteer|selenium|webdriver/i

export interface PopularityTokenPayload {
  eventId: string
  expiresAt: number
  nonce: string
  issuedAt: number | null
}

export interface PopularityDeviceTokenPayload {
  eventId: string
  deviceId: string
}

export interface PopularityPageTicketPayload {
  eventId: string
  deviceHash: string
  expectedRevision: number
  issuedAt: number
  expiresAt: number
}

export interface PopularityWechatTicketPayload {
  eventId: string
  openIdHash: string
  issuedAt: number
  expiresAt: number
}

export interface PopularityVoteEnvInput {
  tz?: string
  lang?: string
  screen?: string
  touch?: number
}

/**
 * 大屏二维码只带短期签名，不落库：同一张码在 TTL 内可以被多台设备扫，
 * 过期后大屏自动换下一张。token 绑定 eventId，换赛事不能复用。
 */
export function issuePopularityToken(
  secret: string,
  eventId: string,
  ttlMs: number
): { token: string, expiresAt: number } {
  const issuedAt = Date.now()
  const expiresAt = issuedAt + Math.max(30_000, Math.min(600_000, ttlMs))
  const nonce = randomBytes(12).toString('base64url')
  const payload = Buffer.from(`${eventId}.${expiresAt}.${nonce}.${issuedAt}`).toString('base64url')
  const signature = createHmac('sha256', secret)
    .update(TOKEN_PURPOSE)
    .update('\0')
    .update(payload)
    .digest('base64url')
  return { token: `${payload}.${signature}`, expiresAt }
}

export function verifyPopularityToken(secret: string, token: string): PopularityTokenPayload | null {
  const separator = token.lastIndexOf('.')
  if (separator <= 0) return null
  const payload = token.slice(0, separator)
  const signature = token.slice(separator + 1)
  const expected = createHmac('sha256', secret)
    .update(TOKEN_PURPOSE)
    .update('\0')
    .update(payload)
    .digest('base64url')
  if (!safeEqual(signature, expected)) return null

  let decoded: string
  try {
    decoded = Buffer.from(payload, 'base64url').toString('utf8')
  } catch {
    return null
  }
  const [eventId, expiresRaw, nonceRaw = '', issuedRaw] = decoded.split('.')
  const expiresAt = Number(expiresRaw)
  if (!eventId || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null
  const issuedParsed = issuedRaw === undefined ? Number.NaN : Number(issuedRaw)
  return {
    eventId,
    expiresAt,
    nonce: nonceRaw.slice(0, 16),
    issuedAt: Number.isFinite(issuedParsed) && issuedParsed > 0 ? issuedParsed : null
  }
}

/**
 * 页面加载凭证：由 GET /state 签发，绑定赛事、设备哈希与预期选票版本号，
 * 投票时服务端用 Date.now() - issuedAt 反推出真实页面停留毫秒数并防止旧凭证重放。
 */
export function issuePopularityPageTicket(
  secret: string,
  eventId: string,
  deviceHash: string,
  expectedRevision = 0,
  now = Date.now()
): string {
  const expiresAt = now + PAGE_TICKET_TTL_MS
  const rev = Math.max(0, Math.trunc(expectedRevision))
  const nonce = randomBytes(8).toString('base64url')
  const payload = Buffer.from(`${eventId}.${deviceHash}.${rev}.${now}.${expiresAt}.${nonce}`).toString('base64url')
  const signature = createHmac('sha256', secret)
    .update(PAGE_TICKET_PURPOSE)
    .update('\0')
    .update(payload)
    .digest('base64url')
  return `${payload}.${signature}`
}

export function verifyPopularityPageTicket(
  secret: string,
  ticket: string | null | undefined,
  eventId: string,
  deviceHash: string,
  expectedRevision?: number,
  now = Date.now()
): PopularityPageTicketPayload | null {
  if (!ticket) return null
  const separator = ticket.lastIndexOf('.')
  if (separator <= 0) return null
  const payload = ticket.slice(0, separator)
  const signature = ticket.slice(separator + 1)
  const expected = createHmac('sha256', secret)
    .update(PAGE_TICKET_PURPOSE)
    .update('\0')
    .update(payload)
    .digest('base64url')
  if (!safeEqual(signature, expected)) return null

  let decoded: string
  try {
    decoded = Buffer.from(payload, 'base64url').toString('utf8')
  } catch {
    return null
  }
  const [ticketEventId, ticketDeviceHash, revRaw, issuedRaw, expiresRaw] = decoded.split('.')
  const ticketRevision = Number(revRaw)
  const issuedAt = Number(issuedRaw)
  const expiresAt = Number(expiresRaw)
  if (
    !ticketEventId
    || ticketEventId !== eventId
    || !ticketDeviceHash
    || !safeEqual(ticketDeviceHash, deviceHash)
    || !Number.isInteger(ticketRevision)
    || ticketRevision < 0
    || (expectedRevision !== undefined && ticketRevision !== expectedRevision)
    || !Number.isFinite(issuedAt)
    || !Number.isFinite(expiresAt)
    || issuedAt > now + 5000
    || expiresAt <= now
  ) {
    return null
  }
  return {
    eventId: ticketEventId,
    deviceHash: ticketDeviceHash,
    expectedRevision: ticketRevision,
    issuedAt,
    expiresAt
  }
}

/**
 * 设备令牌由服务端签名，浏览器存 localStorage；它比 HttpOnly cookie 多活一层：
 * 清 cookie 不会重置投票身份，只有清站点数据/无痕窗口才会换成新设备。
 */
export function issuePopularityDeviceToken(
  secret: string,
  eventId: string,
  deviceId: string
): string {
  const payload = Buffer.from(`${eventId}.${deviceId}`).toString('base64url')
  const signature = createHmac('sha256', secret)
    .update(DEVICE_TOKEN_PURPOSE)
    .update('\0')
    .update(payload)
    .digest('base64url')
  return `${payload}.${signature}`
}

export function verifyPopularityDeviceToken(
  secret: string,
  token: string | null | undefined
): PopularityDeviceTokenPayload | null {
  if (!token) return null
  const separator = token.lastIndexOf('.')
  if (separator <= 0) return null
  const payload = token.slice(0, separator)
  const signature = token.slice(separator + 1)
  const expected = createHmac('sha256', secret)
    .update(DEVICE_TOKEN_PURPOSE)
    .update('\0')
    .update(payload)
    .digest('base64url')
  if (!safeEqual(signature, expected)) return null

  let decoded: string
  try {
    decoded = Buffer.from(payload, 'base64url').toString('utf8')
  } catch {
    return null
  }
  const separatorIndex = decoded.indexOf('.')
  if (separatorIndex <= 0) return null
  const eventId = decoded.slice(0, separatorIndex)
  const deviceId = decoded.slice(separatorIndex + 1)
  if (!eventId || deviceId.length < 24 || deviceId.length > 128) return null
  return { eventId, deviceId }
}

export function popularityIpHash(secret: string, ip: string): string {
  return hashOpaqueToken(secret, IP_PURPOSE, ip)
}

export function hasPopularityDeviceCookie(event: H3Event): boolean {
  return validDeviceId(getCookie(event, DEVICE_COOKIE))
}

/**
 * 校验投票请求回传的 yeu_popularity_device HttpOnly Cookie 是否存在且与当前设备哈希一致。
 * 真实浏览器打开投票页访问 /state 时必已种下 Cookie，投票必定带回；
 * 无状态脚本若丢弃 Cookie 企图每次调 /state 换新设备刷票，将被直接阻断。
 */
export function hasMatchingPopularityDeviceCookie(
  event: H3Event,
  secret: string,
  deviceHash: string
): boolean {
  const cookieDevice = getCookie(event, DEVICE_COOKIE)
  if (!validDeviceId(cookieDevice)) return false
  const cookieHash = hashOpaqueToken(secret, DEVICE_PURPOSE, cookieDevice)
  return safeEqual(cookieHash, deviceHash)
}

export function summarizePopularityUserAgent(userAgent: string | null | undefined): string {
  const value = (userAgent || '').trim()
  if (!value) return 'unknown'
  if (AUTOMATED_UA_PATTERN.test(value) || value.length < 12) return 'Bot/Script'
  const platform = /iPhone|iPad|iPod/i.test(value)
    ? 'iOS'
    : /Android/i.test(value)
      ? 'Android'
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
      : /Edg/i.test(value)
        ? 'Edge'
        : /Chrome|CriOS/i.test(value)
          ? 'Chrome'
          : /Safari/i.test(value)
            ? 'Safari'
            : /Firefox/i.test(value)
              ? 'Firefox'
              : 'Other'
  return `${platform}/${browser}`
}

export function detectAutomatedPopularityAgent(userAgent: string | null | undefined): string | null {
  const value = (userAgent || '').trim()
  if (AUTOMATED_UA_PATTERN.test(value)) return 'BOT_USER_AGENT'
  if (value.length < 12) return 'EMPTY_USER_AGENT'
  return null
}

export function popularityEnvHash(
  secret: string,
  event: H3Event,
  clientEnv?: PopularityVoteEnvInput | null
): string {
  const uaSummary = summarizePopularityUserAgent(getHeader(event, 'user-agent'))
  const acceptLanguage = (getHeader(event, 'accept-language') || '').split(',')[0]?.trim().toLowerCase() || ''
  const secPlatform = (getHeader(event, 'sec-ch-ua-platform') || '').replace(/"/g, '').trim().toLowerCase()
  const parts = [
    uaSummary,
    acceptLanguage,
    secPlatform,
    (clientEnv?.tz || '').trim().toLowerCase(),
    (clientEnv?.lang || '').trim().toLowerCase(),
    (clientEnv?.screen || '').trim().toLowerCase(),
    clientEnv?.touch !== undefined ? String(clientEnv.touch) : ''
  ]
  return hashOpaqueToken(secret, ENV_PURPOSE, parts.join('|'))
}

function validDeviceId(value: string | undefined | null): value is string {
  return Boolean(value && value.length >= 24 && value.length <= 128)
}

/**
 * 解析本机设备身份：优先验签 localStorage 令牌，其次 HttpOnly cookie，
 * 都没有才新建。每次响应都返回新的签名令牌，页面负责持久化。
 */
export function resolvePopularityDevice(
  event: H3Event,
  secret: string,
  secureCookies: boolean,
  eventId: string,
  clientToken?: string
): { deviceHash: string, token: string } {
  const claimed = verifyPopularityDeviceToken(secret, clientToken)
  const existing = getCookie(event, DEVICE_COOKIE)
  const cookieDevice = validDeviceId(existing) ? existing : null
  const deviceId = claimed?.eventId === eventId
    ? claimed.deviceId
    : cookieDevice ?? createOpaqueToken()

  if (deviceId !== existing) {
    setCookie(event, DEVICE_COOKIE, deviceId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookies,
      maxAge: 60 * 60 * 24 * 365
    })
  }

  return {
    deviceHash: hashOpaqueToken(secret, DEVICE_PURPOSE, deviceId),
    token: issuePopularityDeviceToken(secret, eventId, deviceId)
  }
}

/** 每分钟轮换的 2 位现场动态口令（10–99），供大屏展示与公众号回复领票核对。 */
export function computePopularityWechatPasscode(
  secret: string,
  eventId: string,
  now = Date.now(),
  fixedPasscode?: string | null
): string {
  const fixed = (fixedPasscode || '').trim()
  if (/^\d{2}$/.test(fixed)) return fixed
  const bucket = Math.floor(now / PASSCODE_WINDOW_MS)
  const digest = createHmac('sha256', secret)
    .update(PASSCODE_PURPOSE)
    .update('\0')
    .update(`${eventId}:${bucket}`)
    .digest()
  const numeric = 10 + (digest.readUInt16BE(0) % 90)
  return String(numeric)
}

export function verifyPopularityWechatPasscode(
  secret: string,
  eventId: string,
  code: string | null | undefined,
  now = Date.now(),
  fixedPasscode?: string | null
): boolean {
  const normalized = (code || '').trim()
  if (!/^\d{2}$/.test(normalized)) return false
  const fixed = (fixedPasscode || '').trim()
  if (/^\d{2}$/.test(fixed)) return safeEqual(normalized, fixed)
  const current = computePopularityWechatPasscode(secret, eventId, now)
  const previous = computePopularityWechatPasscode(secret, eventId, now - PASSCODE_WINDOW_MS)
  return safeEqual(normalized, current) || safeEqual(normalized, previous)
}

export function popularityOpenIdHash(secret: string, eventId: string, openId: string): string {
  return hashOpaqueToken(secret, OPENID_PURPOSE, `${eventId}:${openId.trim()}`)
}

export function issuePopularityWechatTicket(
  secret: string,
  eventId: string,
  openIdHash: string,
  ttlMs = WECHAT_TICKET_TTL_MS,
  now = Date.now()
): { ticket: string, expiresAt: number } {
  const expiresAt = now + Math.max(60_000, Math.min(3 * 3600_000, ttlMs))
  const nonce = randomBytes(10).toString('base64url')
  const payload = Buffer.from(`${eventId}.${openIdHash}.${now}.${expiresAt}.${nonce}`).toString('base64url')
  const signature = createHmac('sha256', secret)
    .update(WECHAT_TICKET_PURPOSE)
    .update('\0')
    .update(payload)
    .digest('base64url')
  return { ticket: `${payload}.${signature}`, expiresAt }
}

export function verifyPopularityWechatTicket(
  secret: string,
  ticket: string | null | undefined,
  now = Date.now()
): PopularityWechatTicketPayload | null {
  if (!ticket) return null
  const separator = ticket.lastIndexOf('.')
  if (separator <= 0) return null
  const payload = ticket.slice(0, separator)
  const signature = ticket.slice(separator + 1)
  const expected = createHmac('sha256', secret)
    .update(WECHAT_TICKET_PURPOSE)
    .update('\0')
    .update(payload)
    .digest('base64url')
  if (!safeEqual(signature, expected)) return null

  let decoded: string
  try {
    decoded = Buffer.from(payload, 'base64url').toString('utf8')
  } catch {
    return null
  }
  const [eventId, openIdHash, issuedRaw, expiresRaw] = decoded.split('.')
  const issuedAt = Number(issuedRaw)
  const expiresAt = Number(expiresRaw)
  if (
    !eventId
    || !openIdHash
    || openIdHash.length < 16
    || !Number.isFinite(issuedAt)
    || !Number.isFinite(expiresAt)
    || issuedAt > now + 5000
    || expiresAt <= now
  ) {
    return null
  }
  return { eventId, openIdHash, issuedAt, expiresAt }
}

export function issuePopularityDisplaySession(
  event: H3Event,
  secret: string,
  secureCookies: boolean
): string {
  const sessionToken = createOpaqueToken()
  setCookie(event, DISPLAY_SESSION_COOKIE, sessionToken, {
    path: '/api/public/competition/popularity',
    httpOnly: true,
    sameSite: 'strict',
    secure: secureCookies,
    maxAge: 60 * 60 * 12
  })
  return hashOpaqueToken(secret, DISPLAY_SESSION_PURPOSE, sessionToken)
}

export function hasValidPopularityDisplaySession(
  event: H3Event,
  secret: string,
  expectedSessionHash: string | null | undefined
): boolean {
  if (!expectedSessionHash) return false
  const sessionToken = getCookie(event, DISPLAY_SESSION_COOKIE)
  if (!validDeviceId(sessionToken)) return false
  const actualHash = hashOpaqueToken(secret, DISPLAY_SESSION_PURPOSE, sessionToken)
  return safeEqual(actualHash, expectedSessionHash)
}

export function hasBrowserFetchMetadata(event: H3Event): boolean {
  const mode = (getHeader(event, 'sec-fetch-mode') || '').trim().toLowerCase()
  const dest = (getHeader(event, 'sec-fetch-dest') || '').trim().toLowerCase()
  return (mode === 'cors' || mode === 'same-origin') && dest === 'empty'
}
