import { visitorTrackSchema } from '../../../../shared/schemas/server'
import { getPublicPageViewStats, recordVisitorEvent } from '../../../modules/visitors/service'
import { getOptionalUserSession } from '../../../utils/user-auth'
import { useAppDatabase } from '../../../utils/database'
import { getClientIpAddress } from '../../../utils/client-ip'
import { assertRateLimit } from '../../../utils/rate-limit'
import { assertTrustedOrigin } from '../../../utils/security'
import { parseBody } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const ip = getClientIpAddress(event)
  assertRateLimit(event, `public-track:${ip}`, 60, 60 * 1000, client)
  const input = await parseBody(event, visitorTrackSchema)
  const session = getOptionalUserSession(event, client)
  const trackedPath = input.path?.trim() || getRequestURL(event).pathname
  const result = recordVisitorEvent(event, client, {
    action: input.action,
    path: trackedPath,
    meta: input.meta,
    userId: session?.user.id ?? null
  })
  return {
    ok: true,
    visitorId: result.visitorId,
    eventId: result.eventId,
    ...(input.action === 'page_view'
      ? { stats: getPublicPageViewStats(client, trackedPath) }
      : {})
  }
})
