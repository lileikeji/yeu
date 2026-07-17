/**
 * Nuxt error handling treats any Accept that includes text/html as a document
 * request — even for /api/* — so createError() becomes an HTML error page and
 * clients cannot read data.code (CHAT_MUTED, AUTHENTICATION_REQUIRED, …).
 *
 * Normalize Accept on API routes before handlers/error pages run.
 */
export default defineEventHandler((event) => {
  const rawPath = event.path || event.node?.req?.url || '/'
  const path = String(rawPath).split('?')[0] || '/'
  if (path !== '/api' && !path.startsWith('/api/')) return

  const req = event.node?.req
  if (!req?.headers) return

  const accept = String(req.headers.accept || '')
  if (!accept.toLowerCase().includes('text/html')) return

  req.headers.accept = 'application/json'
})
