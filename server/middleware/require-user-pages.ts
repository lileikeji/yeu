/**
 * Keep the retired student account surfaces out of the public site.
 *
 * The account APIs remain available to the server integrations and admin tools,
 * but the old student-facing pages must not be reachable through a saved link.
 * A server-side redirect is important here because Nuxt route middleware can
 * still render a page shell during SSR before the client middleware runs.
 */
import { getMethod, getRequestURL, sendRedirect, setHeader } from 'h3'

function normalizePath(pathname: string): string {
  const path = pathname.replace(/\/+$/, '') || '/'
  return path
}

function isDisabledStudentPage(pathname: string): boolean {
  const path = normalizePath(pathname)
  if (path.startsWith('/api') || path.startsWith('/_nuxt') || path.startsWith('/__nuxt')) {
    return false
  }
  return path === '/login'
    || path.startsWith('/login/')
    || path === '/chat'
    || path.startsWith('/chat/')
    || path === '/me'
    || path.startsWith('/me/')
}

function applyPrivatePageHeaders(event: Parameters<typeof setHeader>[0]): void {
  // Never let CDN/browser cache private HTML or the guest login redirect.
  setHeader(event, 'Cache-Control', 'private, no-store, no-cache, must-revalidate')
  setHeader(event, 'CDN-Cache-Control', 'no-store')
  setHeader(event, 'Cloudflare-CDN-Cache-Control', 'no-store')
  setHeader(event, 'Edge-Control', 'no-store')
  setHeader(event, 'Pragma', 'no-cache')
}

export default defineEventHandler((event) => {
  const method = getMethod(event).toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') return

  const url = getRequestURL(event)
  if (!isDisabledStudentPage(url.pathname)) return

  applyPrivatePageHeaders(event)
  return sendRedirect(event, '/', 302)
})
