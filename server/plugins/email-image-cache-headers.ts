import { getQuery } from 'h3'

export default defineNitroPlugin((nitroApp) => {
  // 邮件插图与选手照片走 /media/competition/...：它们必须能被 CDN 缓存，
  // 但全局的 document/no-cache 中间件会给非 /api 的 GET 追加 no-store，
  // 多个 Cache-Control 合并后 CDN 会按最严格的来，等于永远回源。
  // 这里在响应收尾阶段把缓存头改回单值。
  nitroApp.hooks.hook('beforeResponse', (event) => {
    const pathname = getRequestURL(event).pathname || ''
    if (!pathname.startsWith('/media/competition/')) {
      return
    }
    if (event.node?.res?.statusCode !== 200) {
      return
    }
    if (pathname.startsWith('/media/competition/singer-photo/')) {
      const hasVersion = Boolean(String(getQuery(event).v ?? '').trim())
      setResponseHeader(
        event,
        'Cache-Control',
        hasVersion ? 'public, max-age=31536000, immutable' : 'public, max-age=1800'
      )
      setResponseHeader(
        event,
        'CDN-Cache-Control',
        hasVersion ? 'public, max-age=31536000' : 'public, max-age=1800'
      )
    } else {
      setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
      setResponseHeader(event, 'CDN-Cache-Control', 'public, max-age=31536000')
    }
    setResponseHeader(event, 'Cross-Origin-Resource-Policy', 'cross-origin')
    removeResponseHeader(event, 'Cloudflare-CDN-Cache-Control')
    removeResponseHeader(event, 'Surrogate-Control')
    removeResponseHeader(event, 'Edge-Control')
    removeResponseHeader(event, 'Pragma')
    removeResponseHeader(event, 'Expires')
  })
})
