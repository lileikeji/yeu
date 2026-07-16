import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'

import {
  ALL_CSRF_COOKIE_NAMES,
  ALL_SESSION_COOKIE_NAMES,
  authCookieNames,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  HOST_CSRF_COOKIE_NAME,
  HOST_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME
} from '../../shared/constants/security'

export {
  ALL_CSRF_COOKIE_NAMES,
  ALL_SESSION_COOKIE_NAMES,
  authCookieNames,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  HOST_CSRF_COOKIE_NAME,
  HOST_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME
}
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

  // Local development only: allow the current request host so localhost ports work
  // without duplicating every dev origin in NUXT_ALLOWED_ORIGINS. Production must
  // use an explicit allowlist (siteUrl + NUXT_ALLOWED_ORIGINS).
  if (process.env.NODE_ENV !== 'production' && requestOrigin) {
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
  const names = authCookieNames(secure)
  const common = {
    path: '/' as const,
    sameSite: 'lax' as const,
    // __Host- requires Secure + Path=/ and forbids Domain.
    secure,
    expires: new Date(expiresAt)
  }

  // Drop the alternate cookie namespace so only one session pair is active.
  clearAuthCookieNames(event, secure
    ? [SESSION_COOKIE_NAME, CSRF_COOKIE_NAME]
    : [
        HOST_SESSION_COOKIE_NAME,
        HOST_CSRF_COOKIE_NAME
      ], !secure)

  setCookie(event, names.session, sessionToken, {
    ...common,
    httpOnly: true
  })
  setCookie(event, names.csrf, csrfToken, {
    ...common,
    httpOnly: false
  })
}

function clearAuthCookieNames(
  event: H3Event,
  names: readonly string[],
  preferSecure: boolean
): void {
  const base = {
    path: '/' as const,
    sameSite: 'lax' as const
  }
  for (const name of names) {
    // Try both Secure flags so leftover cookies from env transitions are cleared.
    deleteCookie(event, name, { ...base, secure: true })
    deleteCookie(event, name, { ...base, secure: false })
    if (preferSecure) {
      deleteCookie(event, name, { ...base, secure: true })
    }
  }
}

export function readSessionCookie(event: H3Event): string | undefined {
  return getCookie(event, HOST_SESSION_COOKIE_NAME)
    || getCookie(event, SESSION_COOKIE_NAME)
    || undefined
}

export function readCsrfCookie(event: H3Event): string | undefined {
  return getCookie(event, HOST_CSRF_COOKIE_NAME)
    || getCookie(event, CSRF_COOKIE_NAME)
    || undefined
}

export function clearAuthCookies(event: H3Event): void {
  // Match Path=/ and both Secure flags so Secure/SameSite/__Host- cookies clear reliably.
  clearAuthCookieNames(event, [
    ...ALL_SESSION_COOKIE_NAMES,
    ...ALL_CSRF_COOKIE_NAMES
  ], true)
}
