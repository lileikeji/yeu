/**
 * Hard gate for private HTML pages: guests cannot open /chat or /me at all.
 * Complements Nuxt route middleware (client SPA nav) and API requireUserSession (401).
 * Nuxt middleware alone may still SSR the protected page shell as 200 for guests.
 */
import { getMethod, getRequestURL, sendRedirect } from 'h3'
import { getOptionalUserSession } from '../utils/user-auth'
import { useAppDatabase } from '../utils/database'

function normalizePath(pathname: string): string {
  const path = pathname.replace(/\/+$/, '') || '/'
  return path
}

function isProtectedAppPage(pathname: string): boolean {
  const path = normalizePath(pathname)
  if (path.startsWith('/api') || path.startsWith('/_nuxt') || path.startsWith('/__nuxt')) {
    return false
  }
  return path === '/chat'
    || path.startsWith('/chat/')
    || path === '/me'
    || path.startsWith('/me/')
}

export default defineEventHandler((event) => {
  const method = getMethod(event).toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') return

  const url = getRequestURL(event)
  if (!isProtectedAppPage(url.pathname)) return

  let authenticated = false
  try {
    const session = getOptionalUserSession(event, useAppDatabase(event))
    authenticated = Boolean(session?.user)
  } catch {
    authenticated = false
  }

  if (authenticated) return

  const redirectTarget = `${normalizePath(url.pathname)}${url.search || ''}`
  const safeRedirect = redirectTarget.startsWith('/') && !redirectTarget.startsWith('//')
    ? redirectTarget
    : '/me'

  return sendRedirect(
    event,
    `/login?redirect=${encodeURIComponent(safeRedirect)}`,
    302
  )
})
