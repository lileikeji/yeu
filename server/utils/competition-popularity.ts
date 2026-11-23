import { createHmac, randomBytes } from 'node:crypto'
import { getCookie, setCookie } from 'h3'
import type { H3Event } from 'h3'

import { createOpaqueToken, hashOpaqueToken, safeEqual } from './security'

const TOKEN_PURPOSE = 'competition-popularity-token'
const DEVICE_PURPOSE = 'competition-popularity-device'
const DEVICE_TOKEN_PURPOSE = 'competition-popularity-device-token'
const IP_PURPOSE = 'competition-popularity-ip'
const DEVICE_COOKIE = 'yeu_popularity_device'

export interface PopularityTokenPayload {
  eventId: string
  expiresAt: number
}

export interface PopularityDeviceTokenPayload {
  eventId: string
  deviceId: string
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
  const expiresAt = Date.now() + Math.max(30_000, Math.min(600_000, ttlMs))
  const nonce = randomBytes(12).toString('base64url')
  const payload = Buffer.from(`${eventId}.${expiresAt}.${nonce}`).toString('base64url')
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
  const [eventId, expiresRaw] = decoded.split('.')
  const expiresAt = Number(expiresRaw)
  if (!eventId || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null
  return { eventId, expiresAt }
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
