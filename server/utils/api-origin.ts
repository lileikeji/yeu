import { getHeader, getRequestURL, setHeader } from 'h3'
import type { H3Event } from 'h3'
import { normalizeOrigin, resolveTrustedOrigins } from './security'

export const API_ORIGIN_EXEMPT_PATHS = new Set([
  '/api/health'
])

export const API_ORIGIN_EXEMPT_PREFIXES = [
  '/api/integrations/'
] as const

export interface ApiOriginHeaders {
  origin?: string
  referer?: string
  secFetchSite?: string
}

export interface ApiOriginAllowedDecision {
  allowed: true
  reason: 'origin' | 'fetch-metadata' | 'referer'
}

export interface ApiOriginRejectedDecision {
  allowed: false
  reason: 'missing-source' | 'origin-mismatch' | 'fetch-site-mismatch' | 'referer-mismatch'
}

export type ApiOriginDecision = ApiOriginAllowedDecision | ApiOriginRejectedDecision

export function isApiOriginExempt(pathname: string): boolean {
  return API_ORIGIN_EXEMPT_PATHS.has(pathname)
    || API_ORIGIN_EXEMPT_PREFIXES.some(prefix => pathname.startsWith(prefix))
}

/**
 * Browser fetches normally carry Sec-Fetch-Site on GET requests, while older
 * embedded browsers often only send Referer. Require one of those same-site
 * signals (or an explicit matching Origin) so a bare curl request cannot read
 * API payloads. This is deliberately a request-context check, not CORS: CORS
 * alone would still allow non-browser clients to fetch the body directly.
 */
export function evaluateApiOrigin(
  headers: ApiOriginHeaders,
  allowedOrigins: ReadonlySet<string>
): ApiOriginDecision {
  const origin = normalizeOrigin(headers.origin || '')
  const refererOrigin = normalizeOrigin(headers.referer || '')
  const fetchSite = String(headers.secFetchSite || '').trim().toLowerCase()

  if (origin && !allowedOrigins.has(origin)) {
    return { allowed: false, reason: 'origin-mismatch' }
  }

  if (fetchSite && fetchSite !== 'same-origin') {
    return { allowed: false, reason: 'fetch-site-mismatch' }
  }

  if (origin && allowedOrigins.has(origin)) {
    return { allowed: true, reason: 'origin' }
  }

  if (fetchSite === 'same-origin') {
    return { allowed: true, reason: 'fetch-metadata' }
  }

  if (refererOrigin && allowedOrigins.has(refererOrigin)) {
    return { allowed: true, reason: 'referer' }
  }

  if (refererOrigin) {
    return { allowed: false, reason: 'referer-mismatch' }
  }

  return { allowed: false, reason: 'missing-source' }
}

export function assertApiOrigin(event: H3Event): void {
  const pathname = getRequestURL(event).pathname.replace(/\/+$/, '') || '/'
  if (!pathname.startsWith('/api') || isApiOriginExempt(pathname)) return

  const allowedOrigins = resolveTrustedOrigins(event)
  if (process.env.NODE_ENV === 'production' && allowedOrigins.size === 0) {
    throw createError({
      statusCode: 500,
      statusMessage: 'API origin allowlist is not configured',
      data: { code: 'API_ORIGIN_ALLOWLIST_EMPTY' }
    })
  }

  const decision = evaluateApiOrigin({
    origin: getHeader(event, 'origin'),
    referer: getHeader(event, 'referer'),
    secFetchSite: getHeader(event, 'sec-fetch-site')
  }, allowedOrigins)

  if (decision.allowed) return

  setHeader(event, 'Cache-Control', 'private, no-store')
  setHeader(event, 'CDN-Cache-Control', 'no-store')
  setHeader(event, 'Cloudflare-CDN-Cache-Control', 'no-store')
  setHeader(event, 'Surrogate-Control', 'no-store')
  setHeader(event, 'X-Robots-Tag', 'noindex, nofollow')
  setHeader(event, 'Vary', 'Origin, Referer, Sec-Fetch-Site')
  throw createError({
    statusCode: 403,
    statusMessage: 'API access requires the website origin',
    data: { code: 'API_ORIGIN_REJECTED' }
  })
}
