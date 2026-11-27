export const WECHAT_SHARE_ICON_VERSION = '20261127wx1'
export const DEFAULT_SHARE_ICON_PATH = `/icons/app-icon-512.png?v=${WECHAT_SHARE_ICON_VERSION}`
export const DEFAULT_SHARE_ICON_URL = `https://yx.huiliyill.cn${DEFAULT_SHARE_ICON_PATH}`

/**
 * Normalize a page share thumbnail to an absolute URL and ensure default
 * 512px system icon references always carry the current cache-busting version.
 */
export function normalizeShareIconUrl(rawUrl: string | null | undefined, origin: string): string {
  const fallback = new URL(DEFAULT_SHARE_ICON_PATH, origin).toString()
  const trimmed = rawUrl?.trim()
  if (!trimmed) return fallback

  try {
    const base = new URL(origin)
    const resolved = new URL(trimmed, base)
    if (
      resolved.origin === base.origin
      && resolved.pathname === '/icons/app-icon-512.png'
      && !resolved.searchParams.has('v')
    ) {
      resolved.searchParams.set('v', WECHAT_SHARE_ICON_VERSION)
    }
    return resolved.toString()
  } catch {
    return fallback
  }
}

/**
 * Strip hash fragments and single-use personal WeChat ticket parameters
 * before passing a link into share cards.
 */
export function stripEphemeralShareParams(rawUrl: string, origin: string): string {
  const url = new URL(rawUrl, origin)
  url.hash = ''
  url.searchParams.delete('vt')
  return url.toString()
}
