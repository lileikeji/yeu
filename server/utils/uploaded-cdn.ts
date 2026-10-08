import { getRequestHost, type H3Event } from 'h3'

/**
 * Fire-and-forget CDN warm-up for an uploaded asset. The site sits behind a
 * CDN; a freshly uploaded image is a cache miss on first view (full origin
 * fetch = slow first paint). Issuing one GET to the public URL makes the CDN
 * fetch-and-cache it immediately, so the first real visitor gets a hit.
 *
 * Best-effort only: never blocks or fails the upload response. When no
 * public host can be derived the warm-up is skipped silently (the asset is
 * still served, just slower on its first view).
 */
// 这里需要完整的 H3Event：useRuntimeConfig / getRequestHost 都按 H3Event 取值，
// 只声明 headers 的结构类型会在调用点报类型不匹配。
export function warmUpUploadedAsset(event: H3Event, urlPath: string): void {
  try {
    const config = useRuntimeConfig(event)
    const configured = (config.public?.siteUrl as string | undefined)?.trim()
    const base = configured?.replace(/\/$/, '')
      || (() => {
        const host = getRequestHost(event)
        if (!host) return ''
        const proto = (config.public?.siteProtocol as string | undefined) === 'http' ? 'http' : 'https'
        return `${proto}://${host}`
      })()
    if (!base) return
    const target = `${base}${urlPath.startsWith('/') ? urlPath : `/${urlPath}`}`
    // AbortSignal.timeout keeps the request from ever hanging the process.
    void fetch(target, { method: 'GET', signal: AbortSignal.timeout(10_000) }).catch(() => {})
  } catch {
    // No-op: warm-up is an optimization, never a failure path.
  }
}
