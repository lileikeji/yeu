import { createPlaceReviewSchema } from '../../../shared/schemas/server'
import { createPlaceReview } from '../../modules/place-reviews/service'
import { useAppDatabase } from '../../utils/database'
import { getClientIpAddress } from '../../utils/client-ip'
import { assertRateLimit } from '../../utils/rate-limit'
import { requireUserSession } from '../../utils/user-auth'
import { parseBody } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const session = requireUserSession(event, client, { csrf: true })
  const ip = getClientIpAddress(event)
  assertRateLimit(event, `place-review:${session.user.id}`, 10, 60 * 60 * 1000, client)
  assertRateLimit(event, `place-review-ip:${ip}`, 30, 60 * 60 * 1000, client)
  const input = await parseBody(event, createPlaceReviewSchema)
  const review = createPlaceReview(client, input, session.user)
  setResponseStatus(event, 201)
  return { review }
})
