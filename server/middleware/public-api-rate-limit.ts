import { getMethod, getRequestURL } from 'h3'
import { getClientIpAddress } from '../utils/client-ip'
import { useAppDatabase } from '../utils/database'
import { assertRateLimit } from '../utils/rate-limit'

/**
 * Baseline abuse protection for public read APIs that do not define their own limits.
 * Search / feedback / amap-owner-drafts keep tighter per-route budgets and are skipped here
 * so the two layers do not double-count the same request.
 */
const OWN_RATE_LIMIT_PREFIXES = [
  '/api/public/search',
  '/api/public/feedback',
  '/api/public/amap-owner-drafts'
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
  // Generous for cached catalog reads; still bounds scraping / expensive listing.
  assertRateLimit(event, `public-api:${ip}`, 180, 60 * 1000, client)
})
