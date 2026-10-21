import { getMethod, getRequestURL } from 'h3'
import { requireJudgeSession } from '../utils/judge-auth'
import { getClientIpAddress } from '../utils/client-ip'
import { useAppDatabase } from '../utils/database'
import { assertRateLimit } from '../utils/rate-limit'

/**
 * Defense-in-depth for /api/judge/*: no judge route can ship without auth.
 * Login and session status stay public; mutating methods require CSRF.
 */
export default defineEventHandler((event) => {
  const pathname = getRequestURL(event).pathname.replace(/\/+$/, '') || '/'
  if (!pathname.startsWith('/api/judge')) return

  const method = getMethod(event).toUpperCase()
  if (method === 'OPTIONS') return

  const client = useAppDatabase(event)

  if (pathname === '/api/judge/auth/login') return
  if (pathname === '/api/judge/auth/session' && method === 'GET') return

  const ip = getClientIpAddress(event)
  assertRateLimit(event, `judge-api:${ip}`, 240, 60 * 1000, client)

  requireJudgeSession(event, client, { csrf: !['GET', 'HEAD'].includes(method) })
})
