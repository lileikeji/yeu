import { getMethod, getRequestURL } from 'h3'
import { getClientIpAddress } from '../utils/client-ip'
import { useAppDatabase } from '../utils/database'
import { assertRateLimit } from '../utils/rate-limit'
import { recordAutoBanStrike } from '../utils/auto-ban'

/**
 * Baseline abuse protection for public read APIs that do not define their own limits.
 * Search / feedback / amap-owner-drafts keep tighter per-route budgets and are skipped here
 * so the two layers do not double-count the same request.
 */
const OWN_RATE_LIMIT_PREFIXES = [
  '/api/public/search',
  '/api/public/assistant',
  '/api/public/feedback',
  '/api/public/amap-owner-drafts',
  '/api/public/transit/plan',
  '/api/public/track'
]

export default defineEventHandler((event) => {
  const pathname = getRequestURL(event).pathname.replace(/\/+$/, '') || '/'
  if (!pathname.startsWith('/api/public')) return

  const method = getMethod(event).toUpperCase()
  if (method === 'OPTIONS') return

  if (OWN_RATE_LIMIT_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return
  }

  const client = useAppDatabase(event)
  const ip = getClientIpAddress(event)
  // CDN peers can temporarily aggregate several visitors behind one validated
  // address. Nginx still enforces the hard request-rate ceiling at the origin.
  try {
    assertRateLimit(event, `public-api:${ip}`, 1200, 60 * 1000, client)
  } catch (error) {
    // A burst that keeps tripping the per-minute budget is crawler-like.
    // Escalate repeated strikes to an automatic IP ban (24h).
    if (isRateLimitError(error)) {
      recordAutoBanStrike(client, ip)
    }
    throw error
  }
})

function isRateLimitError(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && 'statusCode' in error
    && (error as { statusCode?: unknown }).statusCode === 429
}
