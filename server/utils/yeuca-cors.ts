import { createError, getHeader, getMethod, setHeader } from 'h3'
import type { H3Event } from 'h3'
import { normalizeOrigin, resolveTrustedOrigins } from './security'

const YEUCA_PUBLIC_PREFIX = '/api/public/yeuca'

export function isYeucaPublicPath(pathname: string): boolean {
  return pathname === YEUCA_PUBLIC_PREFIX || pathname.startsWith(`${YEUCA_PUBLIC_PREFIX}/`)
}

function isLocalLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    return ['localhost', '127.0.0.1'].includes(url.hostname)
  } catch {
    return false
  }
}

/**
 * 计协独立官网允许跨域拉取只读公开快照与投递纳新。
 * 额外来源通过 `NUXT_YEUCA_ALLOWED_ORIGINS`（逗号分隔）显式授权，不影响主站其他接口护栏。
 */
export function resolveYeucaAllowedOrigins(event: H3Event): Set<string> {
  const allowed = new Set<string>(resolveTrustedOrigins(event))
  for (const raw of (process.env.NUXT_YEUCA_ALLOWED_ORIGINS || '').split(',')) {
    const normalized = normalizeOrigin(raw.trim())
    if (normalized) allowed.add(normalized)
  }
  return allowed
}

export function isOriginAllowedForYeuca(event: H3Event, originHeader: string | undefined): string | null {
  const origin = normalizeOrigin(originHeader || '')
  if (!origin) return null

  if (process.env.NODE_ENV !== 'production' && isLocalLoopbackOrigin(origin)) {
    return origin
  }
  const allowed = resolveYeucaAllowedOrigins(event)
  return allowed.has(origin) ? origin : null
}

export function applyYeucaCors(event: H3Event): void {
  const originHeader = getHeader(event, 'origin')
  const matchedOrigin = isOriginAllowedForYeuca(event, originHeader)
  if (matchedOrigin) {
    setHeader(event, 'Access-Control-Allow-Origin', matchedOrigin)
    setHeader(event, 'Vary', 'Origin')
    setHeader(event, 'Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    setHeader(event, 'Access-Control-Allow-Headers', 'Content-Type')
    setHeader(event, 'Cross-Origin-Resource-Policy', 'cross-origin')
  }
}

export function assertYeucaPostOrigin(event: H3Event): void {
  const method = getMethod(event).toUpperCase()
  if (method === 'OPTIONS') return

  const originHeader = getHeader(event, 'origin') || getHeader(event, 'referer') || ''
  if (!isOriginAllowedForYeuca(event, originHeader)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Origin not allowed for Computer Association endpoint',
      data: { code: 'YEUCA_ORIGIN_REJECTED' }
    })
  }
}
