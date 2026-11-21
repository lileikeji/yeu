import { getMethod, getRequestURL, getQuery } from 'h3'
import { isMusicAssociationContent } from '../modules/competition/service'
import { isComputerAssociationContent } from '../modules/yeuca/service'
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
  if (pathname === '/api/admin/media/images' && method === 'POST') return

  // 计协部门部长仅可操作计协专有后台接口（并在各接口内部按所属部门隔离），不允许越权进全站迎新/活动/老招新接口。
  if (session.admin.yeucaScope?.role === 'minister') {
    if (pathname === '/api/admin/yeuca' || pathname.startsWith('/api/admin/yeuca/')) {
      const organizationContentId = session.admin.organization?.contentId
      if (organizationContentId && isComputerAssociationContent(client, organizationContentId)) return
    }
    throw createError({
      statusCode: 403,
      statusMessage: 'Department minister can only access Computer Association department workspace',
      data: { code: 'ADMIN_SCOPE_FORBIDDEN' }
    })
  }

  if (pathname === '/api/admin/miniapp/analytics' && method === 'GET') return

  // 数据看板：组织管理员只要持有 analytics.view 就能读（handler 内 requireAdminCapability 再校验一次），
  // 否则计协/社团账号点进 /admin/overview 会拿到 403，被前端当成掉登录弹回工作台。
  if (pathname === '/api/admin/overview' && method === 'GET') return

  // 组织管理员只能看到自己组织的活动（服务层再按 organizationContentId 收口）；
  // 审核路由在 handler 内 requireSuperAdmin，不能只靠这里放行。
  if (pathname === '/api/admin/activities' || pathname.startsWith('/api/admin/activities/')) return

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

  // 计协官网内容管理只对计算机协会开放；其他组织管理员一律拒绝。
  if (pathname === '/api/admin/yeuca' || pathname.startsWith('/api/admin/yeuca/')) {
    const organizationContentId = session.admin.organization?.contentId
    if (organizationContentId && isComputerAssociationContent(client, organizationContentId)) return
  }

  throw createError({
    statusCode: 403,
    statusMessage: 'This administrator can only edit the assigned organization',
    data: { code: 'ADMIN_SCOPE_FORBIDDEN' }
  })
})
