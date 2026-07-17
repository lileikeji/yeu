export default defineEventHandler((event) => {
  const path = event.path || ''
  if (path.startsWith('/api/_nuxt_icon')) {
    setResponseHeader(event, 'Cache-Control', 'private, no-store, max-age=0, must-revalidate')
    setResponseHeader(event, 'CDN-Cache-Control', 'no-store')
    setResponseHeader(event, 'Surrogate-Control', 'no-store')
    setResponseHeader(event, 'Pragma', 'no-cache')
    setResponseHeader(event, 'Expires', '0')
    setResponseHeader(event, 'Set-Cookie', 'yeu_icon_nc=1; Path=/api/_nuxt_icon; Max-Age=0; SameSite=Lax; HttpOnly')
  }
})
