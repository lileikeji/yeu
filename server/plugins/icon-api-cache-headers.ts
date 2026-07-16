export default defineNitroPlugin((nitroApp) => {
  // Icon module's defineCachedEventHandler sets s-maxage=604800 after middleware.
  // Force no-store so CDN never shares partial ?icons= collection bodies.
  nitroApp.hooks.hook('beforeResponse', (event) => {
    const path = event.path || getRequestURL(event).pathname || ''
    if (!path.startsWith('/api/_nuxt_icon')) {
      return
    }
    setResponseHeader(event, 'Cache-Control', 'private, no-store, max-age=0')
    setResponseHeader(event, 'CDN-Cache-Control', 'no-store')
    setResponseHeader(event, 'Surrogate-Control', 'no-store')
  })
})