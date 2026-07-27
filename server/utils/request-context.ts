import { randomUUID } from 'node:crypto'

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export const BASE_SECURITY_HEADERS = {
  'Content-Security-Policy': [
    'default-src \'self\'',
    'base-uri \'self\'',
    'object-src \'none\'',
    'frame-ancestors \'none\'',
    'form-action \'self\'',
    'script-src \'self\' \'unsafe-inline\' https://*.amap.com https://*.autonavi.com https://*.map.baidu.com',
    'style-src \'self\' \'unsafe-inline\' https://*.amap.com https://*.autonavi.com https://*.map.baidu.com',
    'img-src \'self\' data: blob: https:',
    'font-src \'self\' data:',
    'connect-src \'self\' https: wss:',
    'worker-src \'self\' blob:',
    'manifest-src \'self\'',
    'frame-src \'self\' https://map.baidu.com https://www.720yun.com'
  ].join('; '),
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-site'
} as const

/**
 * Production HTTPS sites get upgrade-insecure-requests so mixed-content subresource
 * loads are upgraded. Dev/HTTP stays on the base policy to avoid breaking localhost.
 */
export function resolveSecurityHeaders(options: {
  nodeEnv?: string
  siteUrl?: string
  pathname?: string
} = {}): Record<string, string> {
  const headers: Record<string, string> = { ...BASE_SECURITY_HEADERS }
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV
  const siteUrl = options.siteUrl ?? process.env.NUXT_PUBLIC_SITE_URL ?? ''
  const pathname = options.pathname ?? '/'
  const isMapPage = pathname === '/map' || pathname.startsWith('/map/')
  let contentSecurityPolicy = BASE_SECURITY_HEADERS['Content-Security-Policy']
  if (isMapPage) {
    contentSecurityPolicy = contentSecurityPolicy.replace(
      "script-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    )
  }
  const productionHttps = nodeEnv === 'production' && /^https:\/\//i.test(siteUrl.trim())
  if (productionHttps) {
    contentSecurityPolicy += '; upgrade-insecure-requests'
    // HSTS only when the public site URL is HTTPS (opt-in via env / deploy).
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
  }
  headers['Content-Security-Policy'] = contentSecurityPolicy
  return headers
}

export interface RequestLogEntry {
  event: 'http_request'
  timestamp: string
  requestId: string
  method: string
  route: string
  statusCode: number
  durationMs: number
  errorCode: string | null
  aborted: boolean
}

export function normalizeIncomingRequestId(value: string | undefined | null): string | null {
  if (!value || !REQUEST_ID_PATTERN.test(value)) return null
  return value
}

export function resolveRequestId(
  value: string | undefined | null,
  create: () => string = randomUUID
): string {
  return normalizeIncomingRequestId(value) ?? create()
}

// Keep no-store for removed legacy /api/auth/* probes and all admin/auth paths.
export function shouldDisableCache(method: string, pathname: string): boolean {
  const normalizedMethod = method.toUpperCase()
  if (!SAFE_METHODS.has(normalizedMethod)) return true
  return pathname === '/api/admin'
    || pathname.startsWith('/api/admin/')
    || pathname === '/api/auth'
    || pathname.startsWith('/api/auth/')
    || pathname === '/api/me'
    || pathname.startsWith('/api/me/')
    || pathname === '/api/chat'
    || pathname.startsWith('/api/chat/')
    || pathname === '/api/public/track'
    || pathname.startsWith('/api/public/track/')
    || pathname === '/api/public/feedback'
    || pathname.startsWith('/api/public/feedback/')
}

export function requestLoggingEnabled(
  nodeEnv = process.env.NODE_ENV,
  configured = process.env.NUXT_REQUEST_LOGGING
): boolean {
  if (configured === 'true') return true
  if (configured === 'false') return false
  return nodeEnv === 'production'
}

export function createRequestLogEntry(input: {
  requestId: string
  method: string
  pathname: string
  statusCode: number
  durationMs: number
  aborted?: boolean
  now?: number
}): RequestLogEntry {
  const statusCode = Number.isInteger(input.statusCode) && input.statusCode >= 100
    ? input.statusCode
    : 500
  return {
    event: 'http_request',
    timestamp: new Date(input.now ?? Date.now()).toISOString(),
    requestId: input.requestId,
    method: input.method.toUpperCase(),
    route: input.pathname,
    statusCode,
    durationMs: Math.max(0, Math.round(input.durationMs * 10) / 10),
    errorCode: statusCode >= 400 ? ('HTTP_' + statusCode) : null,
    aborted: input.aborted === true
  }
}
