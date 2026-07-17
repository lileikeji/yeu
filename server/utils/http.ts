import type { H3Event } from 'h3'
import { getMethod } from 'h3'
import { requireAdminSession } from './auth'
import { useAppDatabase } from './database'

/**
 * Resolve admin DB + session for handlers.
 * CSRF defaults to required for mutating methods so a forgotten second argument
 * cannot ship a state-changing route without double-submit protection
 * (middleware already enforces the same rule as defense in depth).
 */
export function useAdminRequest(event: H3Event, csrf?: boolean) {
  const client = useAppDatabase(event)
  const method = getMethod(event).toUpperCase()
  const requireCsrf = csrf ?? !['GET', 'HEAD', 'OPTIONS'].includes(method)
  const session = requireAdminSession(event, client, { csrf: requireCsrf })
  setHeader(event, 'Cache-Control', 'no-store')
  return { client, session }
}

/**
 * Short browser-side reuse for public catalog payloads.
 * Intentionally NOT shared-cached at CDN/edge: visitor bans and other origin
 * middleware cannot run on a shared HIT, so edge cache would leak public API
 * bodies to banned clients.
 */
export function setPublicCache(event: H3Event, maxAge = 60): void {
  setHeader(event, 'Cache-Control', `private, max-age=${maxAge}, stale-while-revalidate=${maxAge * 5}`)
  setHeader(event, 'CDN-Cache-Control', 'no-store')
  setHeader(event, 'Cloudflare-CDN-Cache-Control', 'no-store')
}
