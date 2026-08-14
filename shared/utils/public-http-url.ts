/**
 * Policy for URLs that may be stored as public content or fetched by ops tooling.
 * Blocks non-HTTP(S), credentials, loopback, link-local, private, and common
 * cloud-metadata hostnames.
 *
 * Sync helpers validate the URL string only. Use assertSafeResolvedPublicHttpUrl
 * immediately before outbound fetches to also re-check DNS A/AAAA (rebinding).
 */

export interface PublicHttpUrlOptions {
  /** Allow loopback/private hosts (local unit tests only). Default false. */
  allowPrivateNetwork?: boolean
}

/** Injected DNS resolver for tests. Returns IPv4/IPv6 address strings. */
export type HostnameLookup = (hostname: string) => Promise<readonly string[]>

export interface ResolvedPublicHttpUrlOptions extends PublicHttpUrlOptions {
  lookup?: HostnameLookup
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'kubernetes.default',
  'kubernetes.default.svc'
])

function parseIpv4(hostname: string): number[] | null {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return null
  const parts = hostname.split('.').map(part => Number(part))
  if (parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return null
  return parts
}

function isBlockedIpv4(parts: number[]): boolean {
  const a = parts[0]!
  const b = parts[1]!
  if (a === 0) return true // 0.0.0.0/8
  if (a === 10) return true // 10.0.0.0/8
  if (a === 127) return true // loopback
  if (a === 169 && b === 254) return true // link-local / metadata
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16/12
  if (a === 192 && b === 168) return true // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT 100.64/10
  if (a === 198 && (b === 18 || b === 19)) return true // benchmark 198.18/15
  if (a >= 224) return true // multicast / reserved
  return false
}

function expandIpv6(hostname: string): string | null {
  const raw = hostname.toLowerCase()
  if (!raw.includes(':')) return null
  if (raw.includes('.')) {
    // IPv4-mapped forms like ::ffff:127.0.0.1
    const match = raw.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)
    if (match) {
      const v4 = parseIpv4(match[1]!)
      if (!v4) return null
      return '::ffff:' + v4.join('.')
    }
  }
  try {
    // Normalize via URL which accepts bracketed hosts.
    return new URL('http://[' + raw + ']').hostname.replace(/^\[|\]$/g, '').toLowerCase()
  } catch {
    return null
  }
}

/**
 * Extract an embedded IPv4 address from the trailing 32 bits of an
 * IPv4-mapped (::ffff:...) or IPv4-compatible (::...) IPv6 form. Handles both
 * dotted-quad tails (::ffff:127.0.0.1) and the hex form that URL hostname
 * normalization produces (::ffff:7f00:1, ::7f00:1). Returns null otherwise.
 */
function ipv4FromIpv6Tail(tail: string): number[] | null {
  const trimmed = tail.trim()
  if (!trimmed) return null
  const dotted = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (dotted) return parseIpv4(dotted[1]!)

  const hexGroups = trimmed.split(':')
  if (hexGroups.length === 1) {
    const group = hexGroups[0]!
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null
    const lo = parseInt(group, 16)
    return [0, 0, lo >> 8, lo & 0xff]
  }
  if (hexGroups.length === 2) {
    const hi = hexGroups[0]!
    const lo = hexGroups[1]!
    if (!/^[0-9a-f]{1,4}$/.test(hi) || !/^[0-9a-f]{1,4}$/.test(lo)) return null
    const hiValue = parseInt(hi, 16)
    const loValue = parseInt(lo, 16)
    return [hiValue >> 8, hiValue & 0xff, loValue >> 8, loValue & 0xff]
  }
  return null
}

function isBlockedIpv6(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!host) return true
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true // loopback
  if (host === '::' || host === '0:0:0:0:0:0:0:0') return true // unspecified
  if (host.startsWith('fe80:')) return true // link-local
  if (host.startsWith('fc') || host.startsWith('fd')) return true // unique local

  // IPv4-mapped (::ffff:x) and IPv4-compatible (::x) forms embed an IPv4
  // address whose blocked status must be honored (private/loopback/link-local).
  const mapped = host.startsWith('::ffff:')
  const compatible = host.startsWith('::') && host !== '::1' && !mapped
  if (mapped || compatible) {
    const tail = mapped ? host.slice('::ffff:'.length) : host.slice('::'.length)
    const v4 = ipv4FromIpv6Tail(tail)
    if (v4) return isBlockedIpv4(v4)
  }
  return false
}

export function isBlockedNetworkHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '')
  if (!host) return true
  if (BLOCKED_HOSTNAMES.has(host)) return true
  if (host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true

  const v4 = parseIpv4(host)
  if (v4) return isBlockedIpv4(v4)

  if (host.includes(':')) {
    const normalized = expandIpv6(host) || host
    return isBlockedIpv6(normalized)
  }

  return false
}

/** True when hostname is already a numeric IP (no DNS needed). */
export function isLiteralIpHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '')
  if (!host) return false
  if (parseIpv4(host)) return true
  if (!host.includes(':')) return false
  return expandIpv6(host) !== null
}

export function parseSafePublicHttpUrl(
  value: string,
  options: PublicHttpUrlOptions = {}
): URL | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  if (url.href.length > 2048) return null

  if (!options.allowPrivateNetwork && isBlockedNetworkHostname(url.hostname)) {
    return null
  }

  return url
}

export function isSafePublicHttpUrl(
  value: string,
  options: PublicHttpUrlOptions = {}
): boolean {
  return parseSafePublicHttpUrl(value, options) !== null
}

async function defaultHostnameLookup(hostname: string): Promise<string[]> {
  // Dynamic import keeps the sync policy path free of node:dns for client bundles
  // that only import parseSafePublicHttpUrl / isSafePublicHttpUrl.
  const dns = await import('node:dns')
  const records = await dns.promises.lookup(hostname, { all: true, verbatim: true })
  return records.map(record => record.address)
}

/**
 * Fail-closed URL gate for outbound fetches: string policy + DNS A/AAAA re-check.
 * Throws an Error whose message includes SSRF/non-public so callers can classify.
 */
export async function assertSafeResolvedPublicHttpUrl(
  value: string,
  options: ResolvedPublicHttpUrlOptions = {}
): Promise<URL> {
  const url = parseSafePublicHttpUrl(value, options)
  if (!url) {
    throw new Error('Blocked non-public HTTP(S) URL (SSRF protection)')
  }

  if (options.allowPrivateNetwork) return url

  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isLiteralIpHostname(host)) return url

  const lookup = options.lookup ?? defaultHostnameLookup
  let addresses: readonly string[]
  try {
    addresses = await lookup(host)
  } catch {
    throw new Error('Blocked non-public HTTP(S) URL (DNS resolution failed)')
  }

  if (!addresses.length) {
    throw new Error('Blocked non-public HTTP(S) URL (DNS returned no addresses)')
  }

  for (const address of addresses) {
    if (isBlockedNetworkHostname(address)) {
      throw new Error('Blocked non-public HTTP(S) URL (DNS rebinding protection)')
    }
  }

  return url
}

export async function parseSafeResolvedPublicHttpUrl(
  value: string,
  options: ResolvedPublicHttpUrlOptions = {}
): Promise<URL | null> {
  try {
    return await assertSafeResolvedPublicHttpUrl(value, options)
  } catch {
    return null
  }
}

/**
 * Defense-in-depth for href/to binding of stored or third-party URLs.
 * Returns a safe http(s) URL string or null (never javascript:/data:/etc).
 */
export function safeExternalHref(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return isSafePublicHttpUrl(trimmed) ? trimmed : null
}
