import { getMethod, getRequestURL } from 'h3'
import { getOptionalUserSession } from '../utils/user-auth'
import { useAppDatabase } from '../utils/database'
import { assertNotBanned, readVisitorId } from '../modules/visitors/service'
import { getClientIpAddress } from '../utils/client-ip'

/**
 * Block banned IP/visitor/user on public app APIs (not admin, not static).
 */
export default defineEventHandler((event) => {
  const pathname = getRequestURL(event).pathname.replace(/\/+$/, '') || '/'
  const method = getMethod(event).toUpperCase()
  if (method === 'OPTIONS') return

  const protectedPrefixes = [
    '/api/public',
    '/api/auth',
    '/api/me',
    '/api/chat'
  ]
  if (!protectedPrefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return
  }

  // Allow login/session checks so banned users can still be told cleanly after auth.
  if (pathname === '/api/auth/login' || pathname === '/api/auth/session') return

  try {
    const client = useAppDatabase(event)
    const session = getOptionalUserSession(event, client)
    assertNotBanned(event, client, { userId: session?.user.id ?? null })
  } catch (error) {
    // If migration not applied yet, skip ban gate to avoid total outage.
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('no such table') || message.includes('SQLITE_ERROR')) {
      return
    }
    throw error
  }
})
