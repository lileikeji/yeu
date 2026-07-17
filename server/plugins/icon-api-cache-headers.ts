export default defineNitroPlugin((nitroApp) => {
  // Icon module's defineCachedEventHandler sets s-maxage=604800 after middleware.
  // Force no-store + Set-Cookie so CDNs that ignore Cache-Control still refuse to cache
  // partial ?icons= collection bodies under a shared path key.
  nitroApp.hooks.hook('beforeResponse', (event) => {
    const path = event.path || getRequestURL(event).pathname || ''
    if (!path.startsWith('/api/_nuxt_icon')) {
      return
    }
    setResponseHeader(event, 'Cache-Control', 'private, no-store, max-age=0, must-revalidate')
    setResponseHeader(event, 'CDN-Cache-Control', 'no-store')
    setResponseHeader(event, 'Cloudflare-CDN-Cache-Control', 'no-store')
    setResponseHeader(event, 'Surrogate-Control', 'no-store')
    setResponseHeader(event, 'Pragma', 'no-cache')
    setResponseHeader(event, 'Expires', '0')
    // Many edge caches skip storage when Set-Cookie is present and not ignored.
    setResponseHeader(event, 'Set-Cookie', 'yeu_icon_nc=1; Path=/api/_nuxt_icon; Max-Age=0; SameSite=Lax; HttpOnly')
    setResponseHeader(event, 'Vary', 'Accept, Accept-Encoding')
  })
})
