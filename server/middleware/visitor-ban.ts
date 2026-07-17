import { getMethod, getRequestURL, send, setHeader, setResponseStatus } from 'h3'
import { getOptionalUserSession } from '../utils/user-auth'
import { useAppDatabase } from '../utils/database'
import { findActiveBan, readVisitorId } from '../modules/visitors/service'
import { getClientIpAddress } from '../utils/client-ip'

function applyBanHeaders(event: Parameters<typeof setHeader>[0]): void {
  setHeader(event, 'Cache-Control', 'private, no-store, no-cache, must-revalidate')
  setHeader(event, 'CDN-Cache-Control', 'no-store')
  setHeader(event, 'Edge-Control', 'no-store')
  setHeader(event, 'Pragma', 'no-cache')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderBannedHtml(reason: string): string {
  const safeReason = escapeHtml(reason || '访问受限')
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>访问受限</title>
  <style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
      font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#e2e8f0}
    .card{max-width:28rem;padding:2rem 1.5rem;border-radius:1rem;background:#1e293b;box-shadow:0 10px 40px rgba(0,0,0,.35)}
    h1{margin:0 0 .75rem;font-size:1.35rem}
    p{margin:.4rem 0;line-height:1.6;color:#cbd5e1}
    .code{margin-top:1rem;font-size:.8rem;color:#94a3b8}
  </style>
</head>
<body>
  <main class="card">
    <h1>访问受限</h1>
    <p>当前访问已被管理员限制，暂时无法打开站点页面。</p>
    <p>原因：${safeReason}</p>
    <p class="code">VISITOR_BANNED</p>
  </main>
</body>
</html>`
}

/**
 * Block banned IP/visitor/user on public app APIs and public HTML pages.
 * Admin surfaces stay reachable so operators can manage bans.
 *
 * HTML uses an explicit 403 body (not only throw): Nuxt document/SSR paths
 * can still render a 200 shell when middleware only throws createError.
 */
export default defineEventHandler((event) => {
  const pathname = getRequestURL(event).pathname.replace(/\/+$/, '') || '/'
  const method = getMethod(event).toUpperCase()
  if (method === 'OPTIONS') return

  // Never block admin console / admin APIs / static build assets / health.
  if (
    pathname.startsWith('/admin')
    || pathname.startsWith('/api/admin')
    || pathname.startsWith('/_nuxt')
    || pathname.startsWith('/__nuxt')
    || pathname === '/api/health'
    || pathname === '/favicon.ico'
    || pathname === '/robots.txt'
    || pathname === '/sitemap.xml'
  ) {
    return
  }

  const apiPrefixes = [
    '/api/public',
    '/api/auth',
    '/api/me',
    '/api/chat'
  ]
  const isProtectedApi = apiPrefixes.some(
    prefix => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
  const isHtmlPage = !pathname.startsWith('/api')
    && !pathname.startsWith('/_')
    && !pathname.includes('.')

  if (!isProtectedApi && !isHtmlPage) return

  // Allow login/session checks so banned users can still authenticate into a clean error path.
  if (pathname === '/api/auth/login' || pathname === '/api/auth/session') return

  try {
    const client = useAppDatabase(event)
    const session = getOptionalUserSession(event, client)
    const ban = findActiveBan(client, {
      ip: getClientIpAddress(event),
      visitorId: readVisitorId(event),
      userId: session?.user.id ?? null
    })
    if (!ban) return

    applyBanHeaders(event)
    const reason = ban.reason || 'banned'

    if (isHtmlPage) {
      setResponseStatus(event, 403, 'Access denied')
      setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
      return send(event, renderBannedHtml(reason))
    }

    throw createError({
      statusCode: 403,
      statusMessage: 'Access denied',
      data: {
        code: 'VISITOR_BANNED',
        reason
      }
    })
  } catch (error) {
    // If migration not applied yet, skip ban gate to avoid total outage.
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('no such table') || message.includes('SQLITE_ERROR')) {
      return
    }
    throw error
  }
})