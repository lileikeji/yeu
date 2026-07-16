import { getMethod, getRequestURL } from 'h3'
import { requireAdminSession } from '../utils/auth'
import { useAppDatabase } from '../utils/database'

/**
 * Defense-in-depth for /api/admin/* so new handlers cannot ship without auth.
 * Login remains public; session status stays optional GET.
 * Per-handler useAdminRequest still applies for explicit clarity and typing.
 */
export default defineEventHandler((event) => {
  const pathname = getRequestURL(event).pathname.replace(/\/+$/, '') || '/'
  if (!pathname.startsWith('/api/admin')) return

  if (pathname === '/api/admin/auth/login') return

  const method = getMethod(event).toUpperCase()
  if (method === 'OPTIONS') return

  if (pathname === '/api/admin/auth/session' && method === 'GET') return

  const csrf = !['GET', 'HEAD'].includes(method)
  requireAdminSession(event, useAppDatabase(event), { csrf })
})
