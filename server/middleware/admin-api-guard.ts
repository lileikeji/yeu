import { getMethod, getRequestURL, getQuery } from 'h3'
import { isMusicAssociationContent } from '../modules/competition/service'
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

  const publicAuthPaths = new Set([
    '/api/admin/auth/login',
    '/api/admin/auth/device/challenge',
    '/api/admin/auth/device/verify'
  ])

  if (!publicAuthPaths.has(pathname)) {
    const ip = getClientIpAddress(event)
    assertRateLimit(event, `admin-api:${ip}`, 240, 60 * 1000, client)
  }

  if (publicAuthPaths.has(pathname)) return

  if (pathname === '/api/admin/auth/session' && method === 'GET') return

  const csrf = !['GET', 'HEAD'].includes(method)
  const session = requireAdminSession(event, client, { csrf })
  if (session.admin.role === 'super') return

  const passwordOnlyPaths = new Set([
    '/api/admin/auth/session',
    '/api/admin/auth/logout',
    '/api/admin/auth/password'
  ])
  if (session.admin.mustChangePassword && !passwordOnlyPaths.has(pathname)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Password change required',
      data: { code: 'PASSWORD_CHANGE_REQUIRED' }
    })
  }

  if (passwordOnlyPaths.has(pathname)) return
  if (pathname === '/api/admin/miniapp/analytics' && method === 'GET') return
  if (pathname === '/api/admin/media/images' && method === 'POST') return

  const contentMatch = pathname.match(/^\/api\/admin\/content\/([0-9a-f-]+)$/i)
  if (contentMatch
    && ['GET', 'PATCH', 'PUT'].includes(method)
    && contentMatch[1] === session.admin.organization?.contentId) {
    return
  }

  // Recruit admin: the club selector lists only the admin's own content, and
  // every other recruit endpoint scopes itself by the contentId query (handlers
  // re-check requireAdminContentAccess + submission ownership server-side).
  if (pathname === '/api/admin/recruit/clubs' && method === 'GET') return
  if (pathname.startsWith('/api/admin/recruit/')) {
    const requestedContentId = getQuery(event).contentId
    if (requestedContentId === session.admin.organization?.contentId) return
  }

  // 歌手大赛只对音乐协会开放；组织管理员必须是音协本身。
  if (pathname === '/api/admin/competition' || pathname.startsWith('/api/admin/competition/')) {
    const organizationContentId = session.admin.organization?.contentId
    if (organizationContentId && isMusicAssociationContent(client, organizationContentId)) return
  }

  throw createError({
    statusCode: 403,
    statusMessage: 'This administrator can only edit the assigned organization',
    data: { code: 'ADMIN_SCOPE_FORBIDDEN' }
  })
})
