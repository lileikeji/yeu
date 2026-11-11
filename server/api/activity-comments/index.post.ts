import { createHash } from 'node:crypto'
import { createActivityCommentSchema } from '../../../shared/schemas/server'
import { createActivityComment } from '../../modules/activity-comments/service'
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
          .update(`${process.pid}-${ip}-activity-comment`)
          .digest('hex')
          .slice(0, 32)
      }

  assertRateLimit(event, `activity-comment-ip:${ip}`, 20, 60 * 60 * 1000, client)
  if (identity.userId) {
    assertRateLimit(event, `activity-comment:${identity.userId}`, 12, 60 * 60 * 1000, client)
  }

  const input = await parseBody(event, createActivityCommentSchema)
  const result = createActivityComment(client, input, identity, ip)
  setResponseStatus(event, 201)
  return result
})
