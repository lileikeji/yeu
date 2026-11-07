import { createHash } from 'node:crypto'
import { createBusMomentSchema } from '../../../shared/schemas/server'
import { createBusMoment } from '../../modules/transit/bus-moments'
import { useAppDatabase } from '../../utils/database'
import { getClientIpAddress } from '../../utils/client-ip'
import { assertRateLimit } from '../../utils/rate-limit'
import { getOptionalUserSession } from '../../utils/user-auth'
import { parseBody } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const ip = getClientIpAddress(event)

  const session = getOptionalUserSession(event, client, { csrf: true })
  const identity = session?.user
    ? { userId: session.user.id }
    : {
        anonymousKey: createHash('sha256')
          .update(`${process.pid}-${ip}`)
          .digest('hex')
          .slice(0, 32)
      }

  // 与 place-moments 同一档限流：匿名按 IP，登录按账号。
  assertRateLimit(event, `bus-moment-ip:${ip}`, 20, 60 * 60 * 1000, client)
  if (identity.userId) {
    assertRateLimit(event, `bus-moment:${identity.userId}`, 12, 60 * 60 * 1000, client)
  }

  const input = await parseBody(event, createBusMomentSchema)
  const moment = createBusMoment(client, input, identity)
  setResponseStatus(event, 201)
  return { moment }
})
