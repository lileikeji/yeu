import { createHash } from 'node:crypto'
import { createPlaceReviewSchema } from '../../../shared/schemas/server'
import { createPlaceReview } from '../../modules/place-reviews/service'
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
        // Anonymous reviewers are deduplicated by a salted IP hash. The salt
        // is process-lifetime random so the key cannot be reversed, and the
        // hash is stable for one process run — long enough for per-place
        // deduplication without storing raw IPs next to reviews.
        anonymousKey: createHash('sha256')
          .update(`${process.pid}-${ip}`)
          .digest('hex')
          .slice(0, 32)
      }

  assertRateLimit(event, `place-review-ip:${ip}`, 30, 60 * 60 * 1000, client)
  if (identity.userId) {
    assertRateLimit(event, `place-review:${identity.userId}`, 10, 60 * 60 * 1000, client)
  }
  const input = await parseBody(event, createPlaceReviewSchema)
  const review = createPlaceReview(client, input, identity)
  setResponseStatus(event, 201)
  return { review }
})
