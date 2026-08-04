export default defineEventHandler((event) => {
  const pathname = getRequestURL(event).pathname
  const isServiceWorkerAsset = /^\/sw-[a-z0-9-]+\.js$/.test(pathname)
    || pathname === '/registerSW.js'
    || pathname === '/site.webmanifest'

  if (!isServiceWorkerAsset) return

  setResponseHeaders(event, {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'CDN-Cache-Control': 'no-store',
    'Surrogate-Control': 'no-store',
    'Pragma': 'no-cache',
    'Expires': '0'
  })
})
