import { randomUUID } from 'node:crypto'

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export const BASE_SECURITY_HEADERS = {
  'Content-Security-Policy': 'frame-ancestors \'none\'; base-uri \'self\'; object-src \'none\'',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY'
} as const

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

export function shouldDisableCache(method: string, pathname: string): boolean {
  const normalizedMethod = method.toUpperCase()
  if (!SAFE_METHODS.has(normalizedMethod)) return true
  return pathname === '/api/admin'
    || pathname.startsWith('/api/admin/')
    || pathname === '/api/auth'
    || pathname.startsWith('/api/auth/')
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
    errorCode: statusCode >= 400 ? `HTTP_${statusCode}` : null,
    aborted: input.aborted === true
  }
}
