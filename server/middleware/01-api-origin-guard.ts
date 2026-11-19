import { getMethod, getRequestURL } from 'h3'
import { assertApiOrigin } from '../utils/api-origin'
import { isMiniAppPostRoute, isMiniAppReadRoute } from '../utils/miniapp'

/**
 * Native mini-program reads, telemetry and AI queries have no browser Origin/Referer.
 * Only the versioned mini-program namespace gets this narrow exception; all
 * other API paths retain the website-origin guard.
 *
 * Recruit document downloads are also exempted for GETs: admins opening them
 * from the WeChat in-app browser land in a fresh webview that sends neither
 * Origin nor Sec-Fetch-Site nor Referer. These endpoints stay session-gated
 * (HttpOnly admin cookie), GET-only, and scope every response by content
 * ownership, so dropping the context check loses nothing the session
 * does not already guarantee.
 */
export default defineEventHandler((event) => {
  const pathname = getRequestURL(event).pathname.replace(/\/+$/, '') || '/'
  const method = getMethod(event).toUpperCase()
  if (isMiniAppReadRoute(pathname, method) || isMiniAppPostRoute(pathname, method)) return
  if (method === 'GET' && pathname.startsWith('/api/admin/recruit/')) return
  assertApiOrigin(event)
})
