import type { H3Event } from 'h3'
import { requireAdminSession } from './auth'
import { useAppDatabase } from './database'

export function useAdminRequest(event: H3Event, csrf = false) {
  const client = useAppDatabase(event)
  const session = requireAdminSession(event, client, { csrf })
  setHeader(event, 'Cache-Control', 'no-store')
  return { client, session }
}

export function setPublicCache(event: H3Event, maxAge = 60): void {
  setHeader(event, 'Cache-Control', `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 5}`)
}
