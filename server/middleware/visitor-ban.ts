import { getMethod, getRequestURL } from 'h3'
import { getOptionalUserSession } from '../utils/user-auth'
import { useAppDatabase } from '../utils/database'
import { assertNotBanned } from '../modules/visitors/service'

/**
 * Block banned IP/visitor/user on public app APIs and public HTML pages.
 * Admin surfaces stay reachable so operators can manage bans.
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
    assertNotBanned(event, client, { userId: session?.user.id ?? null })
  } catch (error) {
    // If migration not applied yet, skip ban gate to avoid total outage.
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('no such table') || message.includes('SQLITE_ERROR')) {
      return
    }
    throw error
  }
})
