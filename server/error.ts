import {
  getRequestURL,
  send,
  setResponseHeaders,
  setResponseStatus
} from 'h3'

/**
 * Force machine-readable JSON for every /api/* error.
 * Complements middleware/00-api-prefer-json.ts: even if Accept still prefers
 * HTML, we never emit Nuxt HTML error documents under /api.
 */
export default defineNitroErrorHandler(async (error, event, { defaultHandler }) => {
  const pathname = (() => {
    try {
      return getRequestURL(event).pathname.replace(/\/+$/, '') || '/'
    } catch {
      const raw = event.path || event.node?.req?.url || '/'
      return String(raw).split('?')[0] || '/'
    }
  })()
  const isApi = pathname === '/api' || pathname.startsWith('/api/')

  if (!isApi) {
    // Let Nuxt's HTML error handler render page errors.
    return
  }

  const res = await defaultHandler(error, event, {
    json: true,
    silent: false
  })

  const headers: Record<string, string> = {
    ...res.headers,
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store, no-cache, must-revalidate',
    'cdn-cache-control': 'no-store',
    'cloudflare-cdn-cache-control': 'no-store',
    'edge-control': 'no-store',
    'pragma': 'no-cache',
    'x-content-type-options': res.headers?.['x-content-type-options'] || 'nosniff'
  }

  setResponseHeaders(event, headers)
  setResponseStatus(event, res.status, res.statusText)

  const body = typeof res.body === 'string'
    ? res.body
    : JSON.stringify(res.body)

  return send(event, body)
})
