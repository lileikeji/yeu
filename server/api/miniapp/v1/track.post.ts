import { miniappTelemetrySchema } from '../../../../shared/schemas/server'
import { recordVisitorEvent } from '../../../modules/visitors/service'
import { getOptionalUserSession } from '../../../utils/user-auth'
import { useAppDatabase } from '../../../utils/database'
import { getClientIpAddress } from '../../../utils/client-ip'
import { assertRateLimit } from '../../../utils/rate-limit'
import { parseBody } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const ip = getClientIpAddress(event)
  assertRateLimit(event, `miniapp-track:${ip}`, 120, 60 * 1000, client)
  const input = await parseBody(event, miniappTelemetrySchema)
  const session = getOptionalUserSession(event, client)
  const result = recordVisitorEvent(event, client, {
    action: input.action,
    path: input.pathname ?? input.path,
    meta: input.meta,
    userId: session?.user.id ?? null
  })
  return {
    ok: true,
    eventId: result.eventId,
    visitorId: result.visitorId
  }
})
