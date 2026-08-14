import { createHmac } from 'node:crypto'
import { safeEqual } from '../../utils/security'
import {
  assertSafeResolvedPublicHttpUrl,
  isBlockedNetworkHostname
} from '../../../shared/utils/public-http-url'

const MAX_WEBHOOK_CLOCK_SKEW_MS = 5 * 60 * 1000

export function verifyBearerToken(headerValue: string | undefined, expectedToken: string): boolean {
  if (!expectedToken || !headerValue) return false
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim())
  return Boolean(match?.[1] && safeEqual(match[1], expectedToken))
}

export function createOneBotWebhookSignature(secret: string, rawBody: string): string {
  return createHmac('sha1', secret).update(rawBody).digest('hex')
}

export function verifyOneBotWebhookSignature(input: {
  secret: string
  signature: string | undefined
  rawBody: string
}): boolean {
  if (!input.secret || !input.signature) return false
  const provided = input.signature.replace(/^sha1=/i, '').trim().toLowerCase()
  if (!/^[a-f0-9]{40}$/.test(provided)) return false
  return safeEqual(provided, createOneBotWebhookSignature(input.secret, input.rawBody))
}

export function createBotWebhookSignature(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret)
    .update(timestamp)
    .update('.')
    .update(rawBody)
    .digest('hex')
}

export function verifyBotWebhookSignature(input: {
  secret: string
  timestamp: string | undefined
  signature: string | undefined
  rawBody: string
  now?: number
}): boolean {
  if (!input.secret || !input.timestamp || !input.signature) return false
  const timestampMs = Number(input.timestamp)
  if (!Number.isFinite(timestampMs)) return false
  const normalizedTimestamp = timestampMs < 10_000_000_000 ? timestampMs * 1000 : timestampMs
  if (Math.abs((input.now ?? Date.now()) - normalizedTimestamp) > MAX_WEBHOOK_CLOCK_SKEW_MS) return false

  const expected = createBotWebhookSignature(input.secret, input.timestamp, input.rawBody)
  const provided = input.signature.replace(/^sha256=/i, '').trim().toLowerCase()
  return /^[a-f0-9]{64}$/.test(provided) && safeEqual(provided, expected)
}

export function safeOutboundBotUrl(rawValue: string): URL {
  let url: URL
  try {
    url = new URL(rawValue)
  } catch {
    throw new Error('BOT_OUTBOUND_URL_INVALID')
  }
  if (url.username || url.password) throw new Error('BOT_OUTBOUND_URL_INVALID')

  const hostname = url.hostname.toLowerCase()
  const loopback = ['127.0.0.1', '::1', 'localhost'].includes(hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('BOT_OUTBOUND_URL_UNSAFE')
  }

  // HTTPS outbound must not resolve/point at loopback, link-local, private,
  // or cloud-metadata hosts. This mirrors the application's SSRF policy and
  // closes the gap where an https relay URL could reach internal services.
  if (url.protocol === 'https:' && isBlockedNetworkHostname(hostname)) {
    throw new Error('BOT_OUTBOUND_URL_UNSAFE')
  }

  return url
}

/**
 * Fail-closed outbound bot URL gate for actual fetches: synchronous policy
 * (safeOutboundBotUrl) plus a DNS A/AAAA re-check to defeat rebinding.
 * Local http://loopback relay URLs are a test/dev exception and are returned
 * without DNS resolution.
 */
export async function assertSafeOutboundBotUrl(rawValue: string): Promise<URL> {
  const url = safeOutboundBotUrl(rawValue)
  if (url.protocol === 'http:') return url
  return assertSafeResolvedPublicHttpUrl(url.toString())
}
