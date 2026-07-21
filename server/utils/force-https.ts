/**
 * Decide whether to send a permanent redirect to HTTPS.
 * Enabled only when NUXT_FORCE_HTTPS / FORCE_HTTPS is true (ops opt-in).
 * Skips loopback hosts so local health checks keep working.
 */

/** Host header used in Location must be a single hostname[:port] (no CRLF / userinfo / path). */
const SAFE_HOST_PATTERN = /^(?:\[([0-9a-fA-F:]+)\]|([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*))(?::(\d{1,5}))?$/

export function isSafeRedirectHost(host: string): boolean {
  const trimmed = host.trim()
  if (!trimmed || trimmed.length > 253) return false
  if (/[\r\n\0\s/\\@]/.test(trimmed)) return false
  if (trimmed.includes(',')) return false
  const match = SAFE_HOST_PATTERN.exec(trimmed)
  if (!match) return false
  const port = match[3]
  if (port !== undefined) {
    const n = Number(port)
    if (!Number.isInteger(n) || n < 1 || n > 65535) return false
  }
  return true
}

export function shouldRedirectToHttps(input: {
  forceHttps: boolean
  forwardedProto?: string | null
  requestProtocol?: string | null
  host?: string | null
  pathname: string
  search?: string | null
}): { redirect: false } | { redirect: true, location: string } {
  if (!input.forceHttps) return { redirect: false }

  const forwarded = (input.forwardedProto || '')
    .split(',')[0]
    ?.trim()
    .toLowerCase()
  const protocol = (forwarded || input.requestProtocol || 'http')
    .replace(/:$/, '')
    .toLowerCase()

  if (protocol === 'https') return { redirect: false }

  const host = (input.host || '').trim()
  if (!host || !isSafeRedirectHost(host)) return { redirect: false }

  // Local / loopback probes must not be forced onto HTTPS.
  let hostname: string
  if (host.startsWith('[')) {
    const end = host.indexOf(']')
    hostname = end > 1 ? host.slice(1, end) : host
  } else {
    hostname = host.split(':')[0] || host
  }
  if (
    hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || hostname === '0.0.0.0'
  ) {
    return { redirect: false }
  }

  // Path must stay relative to the same host (no scheme-relative open redirect).
  const rawPath = input.pathname || '/'
  if (rawPath.includes('\r') || rawPath.includes('\n') || rawPath.includes('\0')) {
    return { redirect: false }
  }
  const pathname = rawPath.startsWith('/') ? rawPath : ('/' + rawPath)
  if (pathname.startsWith('//')) return { redirect: false }

  let search = ''
  if (input.search && input.search !== '?') {
    const rawSearch = input.search.startsWith('?') ? input.search : ('?' + input.search)
    if (/[\r\n\0]/.test(rawSearch)) return { redirect: false }
    search = rawSearch
  }

  return {
    redirect: true,
    location: 'https://' + host + pathname + search
  }
}

export function forceHttpsEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const value = env.NUXT_FORCE_HTTPS || env.FORCE_HTTPS
  return value === 'true' || value === '1'
}
