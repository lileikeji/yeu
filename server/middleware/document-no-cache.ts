export default defineEventHandler((event) => {
  const method = event.method
  if (method !== 'GET' && method !== 'HEAD') return

  const pathname = getRequestURL(event).pathname
  if (pathname.startsWith('/api/') || pathname.startsWith('/_nuxt/')) return

  const accept = getRequestHeader(event, 'accept') || ''
  if (!accept.includes('text/html')) return

  // Releases replace hashed client bundles atomically. Never let a CDN pair
  // an older HTML document with the newer release's assets.
  setResponseHeaders(event, {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'CDN-Cache-Control': 'no-store',
    'Surrogate-Control': 'no-store',
    'Pragma': 'no-cache',
    'Expires': '0'
  })
})
