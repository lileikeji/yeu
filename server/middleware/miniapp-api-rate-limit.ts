import { getMethod, getRequestURL } from 'h3'
import { getClientIpAddress } from '../utils/client-ip'
import { useAppDatabase } from '../utils/database'
import { assertRateLimit } from '../utils/rate-limit'
import { recordAutoBanStrike } from '../utils/auto-ban'

const MINIAPP_PREFIX = '/api/miniapp/v1/'

function isMiniAppRoute(pathname: string): boolean {
  return pathname.startsWith(MINIAPP_PREFIX)
}

function isRateLimitError(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && 'statusCode' in error
    && (error as { statusCode?: unknown }).statusCode === 429
}

export default defineEventHandler((event) => {
  const pathname = getRequestURL(event).pathname.replace(/\/+$/, '') || '/'
  if (!isMiniAppRoute(pathname)) return
  if (getMethod(event).toUpperCase() !== 'GET') return

  const client = useAppDatabase(event)
  const ip = getClientIpAddress(event)
  try {
    assertRateLimit(event, `miniapp-api:${ip}`, 600, 60 * 1000, client)
  } catch (error) {
    if (isRateLimitError(error)) recordAutoBanStrike(client, ip)
    throw error
  }
})
