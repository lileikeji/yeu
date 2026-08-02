import { getHeader, getRequestURL, setHeader } from 'h3'
import { isAutomationUserAgent, isCrawlerProtectedPath, CRAWL_TRAP_PATH } from '../utils/anti-crawl'

export default defineEventHandler((event) => {
  const pathname = getRequestURL(event).pathname.replace(/\/+$/, '') || '/'
  if (pathname === CRAWL_TRAP_PATH) return
  if (pathname === '/api/health' || pathname === '/robots.txt' || pathname === '/sitemap.xml') return
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) return
  if (!isCrawlerProtectedPath(pathname)) return

  const userAgent = getHeader(event, 'user-agent') || ''
  if (!isAutomationUserAgent(userAgent)) return

  setHeader(event, 'Cache-Control', 'private, no-store')
  setHeader(event, 'CDN-Cache-Control', 'no-store')
  setHeader(event, 'X-Robots-Tag', 'noindex, nofollow')
  setHeader(event, 'Retry-After', 3600)
  throw createError({
    statusCode: 403,
    statusMessage: 'Automated access is not allowed',
    data: { code: 'AUTOMATED_ACCESS_BLOCKED' }
  })
})
