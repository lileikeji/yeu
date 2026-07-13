import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'

export const SESSION_COOKIE_NAME = 'yeu_admin_session'
export const CSRF_COOKIE_NAME = 'yeu_admin_csrf'
export const CSRF_HEADER_NAME = 'x-csrf-token'

export interface SecurityConfig {
  secret: string
  ttlMs: number
  secureCookies: boolean
}

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export function getSecurityConfig(event: H3Event): SecurityConfig {
  const runtimeConfig = useRuntimeConfig(event)
  const secret = String(runtimeConfig.adminSessionSecret || process.env.NUXT_ADMIN_SESSION_SECRET || '')

  if (Buffer.byteLength(secret) < 32) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Admin session secret is not configured',
      data: { code: 'SERVER_SECURITY_MISCONFIGURED' }
    })
  }

  const ttlHoursValue = Number(process.env.NUXT_ADMIN_SESSION_TTL_HOURS || 12)
  const ttlHours = Number.isFinite(ttlHoursValue)
    ? Math.min(168, Math.max(1, ttlHoursValue))
    : 12
  const siteOrigin = normalizeOrigin(String(runtimeConfig.public.siteUrl || ''))

  return {
    secret,
    ttlMs: ttlHours * 60 * 60 * 1000,
    secureCookies: process.env.NODE_ENV === 'production' || siteOrigin?.startsWith('https://') === true
  }
}

export function assertTrustedOrigin(event: H3Event): void {
  const method = getMethod(event).toUpperCase()

  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return
  }

  const origin = normalizeOrigin(getHeader(event, 'origin') || '')
  const runtimeConfig = useRuntimeConfig(event)
  const allowed = new Set<string>()
  const configuredOrigin = normalizeOrigin(String(runtimeConfig.public.siteUrl || ''))
  const requestOrigin = normalizeOrigin(getRequestURL(event).origin)

  if (configuredOrigin) {
    allowed.add(configuredOrigin)
  }

  if (requestOrigin) {
    allowed.add(requestOrigin)
  }

  for (const value of (process.env.NUXT_ALLOWED_ORIGINS || '').split(',')) {
    const extraOrigin = normalizeOrigin(value.trim())
    if (extraOrigin) {
      allowed.add(extraOrigin)
    }
  }

  if (!origin || !allowed.has(origin)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Untrusted request origin',
      data: { code: 'ORIGIN_REJECTED' }
    })
  }
}

export function createOpaqueToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashOpaqueToken(secret: string, purpose: string, value: string): string {
  return createHmac('sha256', secret)
    .update(purpose)
    .update('\0')
    .update(value)
    .digest('hex')
}

export function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function setAuthCookies(
  event: H3Event,
  sessionToken: string,
  csrfToken: string,
  expiresAt: number,
  secure: boolean
): void {
  const common = {
    path: '/',
    sameSite: 'lax' as const,
    secure,
    expires: new Date(expiresAt)
  }

  setCookie(event, SESSION_COOKIE_NAME, sessionToken, {
    ...common,
    httpOnly: true
  })
  setCookie(event, CSRF_COOKIE_NAME, csrfToken, {
    ...common,
    httpOnly: false
  })
}

export function clearAuthCookies(event: H3Event): void {
  deleteCookie(event, SESSION_COOKIE_NAME, { path: '/' })
  deleteCookie(event, CSRF_COOKIE_NAME, { path: '/' })
}
