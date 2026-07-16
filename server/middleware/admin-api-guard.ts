import { getMethod, getRequestURL } from 'h3'
import { requireAdminSession } from '../utils/auth'
import { getClientIpAddress } from '../utils/client-ip'
import { useAppDatabase } from '../utils/database'
import { assertRateLimit } from '../utils/rate-limit'

/**
 * Defense-in-depth for /api/admin/* so new handlers cannot ship without auth.
 * Login remains public; session status stays optional GET.
 * Baseline IP rate limit runs before session checks to bound unauthenticated floods.
 * Login keeps its own tighter scrypt-aware limits in loginAdmin.
 * Per-handler useAdminRequest still applies for explicit clarity and typing.
 */
export default defineEventHandler((event) => {
  const pathname = getRequestURL(event).pathname.replace(/\/+$/, '') || '/'
  if (!pathname.startsWith('/api/admin')) return

  const method = getMethod(event).toUpperCase()
  if (method === 'OPTIONS') return

  const client = useAppDatabase(event)

  if (pathname !== '/api/admin/auth/login') {
    const ip = getClientIpAddress(event)
    assertRateLimit(event, `admin-api:${ip}`, 240, 60 * 1000, client)
  }

  if (pathname === '/api/admin/auth/login') return

  if (pathname === '/api/admin/auth/session' && method === 'GET') return

  const csrf = !['GET', 'HEAD'].includes(method)
  requireAdminSession(event, client, { csrf })
})
