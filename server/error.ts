import { getRequestURL, send, setResponseHeaders, setResponseStatus } from 'h3'

/**
 * Force machine-readable JSON for every /api/* error.
 * Nuxt's default renderer can still emit HTML error documents when Accept
 * includes text/html (common browser/fetch defaults), which breaks clients
 * that only look for data.code (CHAT_MUTED, CSRF, 401, etc.).
 *
 * HTML pages keep Nuxt's normal error rendering via defaultHandler.
 */
export default defineNitroErrorHandler(async (error, event, { defaultHandler }) => {
  const pathname = getRequestURL(event).pathname.replace(/\/+$/, '') || '/'
  const isApi = pathname === '/api' || pathname.startsWith('/api/')

  const res = await defaultHandler(error, event, {
    json: isApi,
    silent: false
  })

  const headers: Record<string, string> = {
    ...res.headers
  }

  if (isApi) {
    headers['content-type'] = 'application/json; charset=utf-8'
    headers['cache-control'] = 'private, no-store, no-cache, must-revalidate'
    headers['cdn-cache-control'] = 'no-store'
    headers['cloudflare-cdn-cache-control'] = 'no-store'
    headers['edge-control'] = 'no-store'
    headers['pragma'] = 'no-cache'
    headers['x-content-type-options'] = headers['x-content-type-options'] || 'nosniff'
  }

  setResponseHeaders(event, headers)
  setResponseStatus(event, res.status, res.statusText)

  const body = typeof res.body === 'string'
    ? res.body
    : JSON.stringify(res.body)

  return send(event, body)
})
