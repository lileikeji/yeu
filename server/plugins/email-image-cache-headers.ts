export default defineNitroPlugin((nitroApp) => {
  // 邮件插图走 /media/competition/<uuid>.png：它必须能被 CDN 长期缓存，
  // 但全局的 document/no-cache 中间件会给非 /api 的 GET 追加 no-store，
  // 多个 Cache-Control 合并后 CDN 会按最严格的来，等于永远回源。
  // 这里在响应收尾阶段把缓存头改回单值，按 uuid 不可变，可直接 immutable。
  nitroApp.hooks.hook('beforeResponse', (event) => {
    const path = event.path || getRequestURL(event).pathname || ''
    if (!path.startsWith('/media/competition/')) {
      return
    }
    if (event.node?.res?.statusCode !== 200) {
      return
    }
    setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
    setResponseHeader(event, 'CDN-Cache-Control', 'public, max-age=31536000')
    removeResponseHeader(event, 'Cloudflare-CDN-Cache-Control')
    removeResponseHeader(event, 'Surrogate-Control')
    removeResponseHeader(event, 'Edge-Control')
    removeResponseHeader(event, 'Pragma')
    removeResponseHeader(event, 'Expires')
  })
})
