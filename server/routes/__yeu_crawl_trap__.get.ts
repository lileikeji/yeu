import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { getHeader, getMethod, getRequestURL, setHeader, setResponseStatus } from 'h3'
import { visitorBans } from '../database/schema'
import { recordVisitorEvent } from '../modules/visitors/service'
import {
  CRAWL_TRAP_ACTION,
  CRAWL_TRAP_PATH,
  CRAWL_TRAP_TTL_MS,
  isAutomationUserAgent
} from '../utils/anti-crawl'
import { getClientIpAddress } from '../utils/client-ip'
import { useAppDatabase } from '../utils/database'

export default defineEventHandler((event) => {
  const client = useAppDatabase(event)
  const ip = getClientIpAddress(event)
  const userAgent = getHeader(event, 'user-agent') || ''
  const now = Date.now()
  const path = getRequestURL(event).pathname || CRAWL_TRAP_PATH

  try {
    recordVisitorEvent(event, client, {
      action: CRAWL_TRAP_ACTION,
      path,
      meta: {
        marker: 'yeu-crawl-trap-v1',
        automatedUserAgent: isAutomationUserAgent(userAgent)
      }
    })

    if (ip !== 'unknown') {
      const existing = client.db.select({ id: visitorBans.id }).from(visitorBans).where(and(
        eq(visitorBans.scope, 'ip'),
        eq(visitorBans.value, ip),
        eq(visitorBans.isActive, true)
      )).get()

      if (!existing) {
        client.db.insert(visitorBans).values({
          id: randomUUID(),
          scope: 'ip',
          value: ip,
          reason: 'crawler_honeypot',
          isActive: true,
          bannedByAdminId: null,
          expiresAt: now + CRAWL_TRAP_TTL_MS,
          createdAt: now,
          updatedAt: now
        }).run()
      }
    }
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      event: CRAWL_TRAP_ACTION,
      requestId: event.context.requestId || null,
      method: getMethod(event).toUpperCase(),
      path,
      error: error instanceof Error ? error.message : String(error)
    })}\n`)
  }

  setHeader(event, 'Cache-Control', 'private, no-store')
  setHeader(event, 'CDN-Cache-Control', 'no-store')
  setHeader(event, 'X-Robots-Tag', 'noindex, nofollow')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setResponseStatus(event, 404, 'Not Found')
  return { error: true, code: 'NOT_FOUND' }
})
