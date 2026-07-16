export default defineEventHandler((event) => {
  const path = event.path || ''
  if (path.startsWith('/api/_nuxt_icon')) {
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    setResponseHeader(event, 'CDN-Cache-Control', 'no-store')
  }
})
