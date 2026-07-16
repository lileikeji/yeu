import type { H3Event } from 'h3'
import { getRequestIP } from 'h3'

/**
 * Client IP for rate limits and audit-adjacent controls.
 *
 * NUXT_TRUST_PROXY=true only honors X-Forwarded-For when the immediate TCP peer
 * is an allowed reverse-proxy hop. Default peer policy is loopback (same-host
 * Nginx -> NITRO_HOST=127.0.0.1). Set NUXT_TRUST_PROXY_PEERS=private to also
 * accept RFC1918 peers (docker sidecars). Spoofed XFF from untrusted peers is ignored.
 */

export type TrustProxyPeerMode = 'loopback' | 'private'

export function trustProxyEnabled(
  value = process.env.NUXT_TRUST_PROXY
): boolean {
  return value === 'true'
}

export function trustProxyPeerMode(
  value = process.env.NUXT_TRUST_PROXY_PEERS
): TrustProxyPeerMode {
  return value === 'private' ? 'private' : 'loopback'
}

function stripZoneId(address: string): string {
  const pct = address.indexOf('%')
  return pct >= 0 ? address.slice(0, pct) : address
}

export function normalizeIpAddress(address: string | null | undefined): string | null {
  if (!address) return null
  const value = stripZoneId(address.trim().toLowerCase())
  if (!value) return null

  // Node may report IPv4-mapped IPv6 as ::ffff:x.x.x.x (or legacy :ffff:x.x.x.x).
  if (value.startsWith('::ffff:')) {
    const mapped = value.slice('::ffff:'.length)
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(mapped)) return mapped
  }
  if (value.startsWith(':ffff:')) {
    const mapped = value.slice(':ffff:'.length)
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(mapped)) return mapped
  }

  return value
}

function parseIpv4(address: string): number[] | null {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)) return null
  const parts = address.split('.').map(part => Number(part))
  if (parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return null
  return parts
}

export function isLoopbackIp(address: string | null | undefined): boolean {
  const value = normalizeIpAddress(address)
  if (!value) return false
  if (value === '127.0.0.1' || value === '::1') return true
  const v4 = parseIpv4(value)
  if (v4 && v4[0] === 127) return true
  return false
}

export function isPrivateIp(address: string | null | undefined): boolean {
  const value = normalizeIpAddress(address)
  if (!value) return false
  if (isLoopbackIp(value)) return true

  const v4 = parseIpv4(value)
  if (v4) {
    const a = v4[0]!
    const b = v4[1]!
    if (a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    return false
  }

  // IPv6 unique local fc00::/7
  if (value.startsWith('fc') || value.startsWith('fd')) return true
  return false
}

export function isTrustedProxyPeer(
  remoteAddress: string | null | undefined,
  mode: TrustProxyPeerMode = trustProxyPeerMode()
): boolean {
  if (mode === 'private') return isPrivateIp(remoteAddress)
  return isLoopbackIp(remoteAddress)
}

export function getImmediatePeerAddress(event: H3Event): string | null {
  const socket = event.node?.req?.socket
  return normalizeIpAddress(socket?.remoteAddress)
}

/**
 * Resolve the client IP used for rate limiting.
 * Never trusts X-Forwarded-For unless NUXT_TRUST_PROXY=true and the TCP peer is trusted.
 */
export function getClientIpAddress(event: H3Event): string {
  const peer = getImmediatePeerAddress(event)
  const allowForwarded = trustProxyEnabled() && isTrustedProxyPeer(peer)

  const fromH3 = getRequestIP(event, { xForwardedFor: allowForwarded })
  const normalized = normalizeIpAddress(fromH3) || peer
  return normalized || 'unknown'
}
