import { createHmac, randomBytes } from 'node:crypto'
import { getCookie, getHeader, getMethod, getRequestURL, setCookie, setHeader } from 'h3'
import type { H3Event } from 'h3'
import { getSecurityConfig, normalizeOrigin, resolveTrustedOrigins, safeEqual } from './security'

export const API_ORIGIN_EXEMPT_PATHS = new Set([
  '/api/health'
])

export const API_ORIGIN_EXEMPT_PREFIXES = [
  '/api/integrations/'
] as const

export const PAGE_CONTEXT_COOKIE_NAME = 'yeu_page_context'
const PAGE_CONTEXT_TTL_SECONDS = 7 * 24 * 60 * 60
const PAGE_CONTEXT_MAX_FUTURE_SKEW_SECONDS = 5 * 60
const PAGE_CONTEXT_EVENT_KEY = 'yeuDocumentRender'

export interface ApiOriginHeaders {
  origin?: string
  referer?: string
  secFetchSite?: string
  pageContext?: boolean
  internalRender?: boolean
}

export interface ApiOriginAllowedDecision {
  allowed: true
  reason: 'origin' | 'fetch-metadata' | 'referer' | 'page-context' | 'internal-render'
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

function pageContextPayload(timestampSeconds: number, nonce: string): string {
  return `${timestampSeconds}.${nonce}`
}

export function createPageContextToken(
  secret: string,
  now = Date.now(),
  nonce = randomBytes(18).toString('base64url')
): string {
  const timestampSeconds = Math.floor(now / 1000)
  const payload = pageContextPayload(timestampSeconds, nonce)
  const signature = createHmac('sha256', secret)
    .update('page-context\0')
    .update(payload)
    .digest('base64url')
  return `${payload}.${signature}`
}

export function isValidPageContextToken(
  token: string,
  secret: string,
  now = Date.now()
): boolean {
  const parts = token.split('.')
  if (parts.length !== 3) return false

  const timestampSeconds = Number(parts[0])
  const nonce = parts[1]
  const signature = parts[2]
  if (!Number.isSafeInteger(timestampSeconds) || !nonce || !signature) return false

  const nowSeconds = Math.floor(now / 1000)
  if (timestampSeconds > nowSeconds + PAGE_CONTEXT_MAX_FUTURE_SKEW_SECONDS) return false
  if (timestampSeconds < nowSeconds - PAGE_CONTEXT_TTL_SECONDS) return false

  const expected = createHmac('sha256', secret)
    .update('page-context\0')
    .update(pageContextPayload(timestampSeconds, nonce))
    .digest('base64url')
  return safeEqual(signature, expected)
}

function isDocumentRequest(event: H3Event): boolean {
  const method = getMethod(event).toUpperCase()
  if (!['GET', 'HEAD'].includes(method)) return false

  const pathname = getRequestURL(event).pathname
  if (pathname.startsWith('/api') || pathname.startsWith('/_') || pathname.includes('.')) return false

  const accept = String(getHeader(event, 'accept') || '').toLowerCase()
  const destination = String(getHeader(event, 'sec-fetch-dest') || '').toLowerCase()
  return destination === 'document'
    || accept.includes('text/html')
    || (!destination && !accept.includes('application/json'))
}

function prepareDocumentContext(event: H3Event): void {
  event.context[PAGE_CONTEXT_EVENT_KEY] = true

  try {
    const security = getSecurityConfig(event)
    const current = getCookie(event, PAGE_CONTEXT_COOKIE_NAME)
    if (current && isValidPageContextToken(current, security.secret)) return

    setCookie(event, PAGE_CONTEXT_COOKIE_NAME, createPageContextToken(security.secret), {
      httpOnly: true,
      sameSite: 'lax',
      secure: security.secureCookies,
      path: '/',
      maxAge: PAGE_CONTEXT_TTL_SECONDS
    })
  } catch {
    // A missing session secret is reported by the production API guard below;
    // page rendering itself must remain available while configuration is fixed.
  }
}

function hasValidPageContext(event: H3Event): boolean {
  try {
    const security = getSecurityConfig(event)
    const token = getCookie(event, PAGE_CONTEXT_COOKIE_NAME)
    return Boolean(token && isValidPageContextToken(token, security.secret))
  } catch {
    return false
  }
}

function isInternalDocumentRender(event: H3Event): boolean {
  if (event.context[PAGE_CONTEXT_EVENT_KEY] === true) return true
  const inheritedContext = (event.node?.req as unknown as {
    __unenv__?: Record<string, unknown>
  } | undefined)?.__unenv__
  return inheritedContext?.[PAGE_CONTEXT_EVENT_KEY] === true
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
  if (headers.internalRender) return { allowed: true, reason: 'internal-render' }

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

  if (headers.pageContext) {
    return { allowed: true, reason: 'page-context' }
  }

  return { allowed: false, reason: 'missing-source' }
}

export function assertApiOrigin(event: H3Event): void {
  const pathname = getRequestURL(event).pathname.replace(/\/+$/, '') || '/'
  if (!pathname.startsWith('/api')) {
    if (isDocumentRequest(event)) prepareDocumentContext(event)
    return
  }
  if (isApiOriginExempt(pathname)) return

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
    secFetchSite: getHeader(event, 'sec-fetch-site'),
    pageContext: hasValidPageContext(event),
    internalRender: isInternalDocumentRender(event)
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
