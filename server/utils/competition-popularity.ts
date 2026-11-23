import { createHmac, randomBytes } from 'node:crypto'
import { getCookie, setCookie } from 'h3'
import type { H3Event } from 'h3'

import { createOpaqueToken, hashOpaqueToken, safeEqual } from './security'

const TOKEN_PURPOSE = 'competition-popularity-token'
const DEVICE_PURPOSE = 'competition-popularity-device'
const DEVICE_COOKIE = 'yeu_popularity_device'

export interface PopularityTokenPayload {
  eventId: string
  expiresAt: number
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
 * 设备 id 只放 HttpOnly cookie，数据库存 HMAC；清 cookie 会变成一台新设备，
 * 这是“不签到、不绑微信”方案下必须接受的边界。cookie 内容异常时直接换新。
 */
export function popularityDeviceHash(
  event: H3Event,
  secret: string,
  secureCookies: boolean
): string {
  const existing = getCookie(event, DEVICE_COOKIE)
  const device = existing && existing.length >= 24 && existing.length <= 128
    ? existing
    : createOpaqueToken()

  if (device !== existing) {
    setCookie(event, DEVICE_COOKIE, device, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookies,
      maxAge: 60 * 60 * 24 * 365
    })
  }

  return hashOpaqueToken(secret, DEVICE_PURPOSE, device)
}
