import { setReviewLike } from '../../../modules/place-reviews/service'
import { useAppDatabase } from '../../../utils/database'
import { getClientIpAddress } from '../../../utils/client-ip'
import { assertRateLimit } from '../../../utils/rate-limit'
import { requireUserSession } from '../../../utils/user-auth'
import { requireUuidParam } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const session = requireUserSession(event, client, { csrf: true })
  const ip = getClientIpAddress(event)
  assertRateLimit(event, `review-like:${session.user.id}`, 120, 60 * 60 * 1000, client)
  assertRateLimit(event, `review-like-ip:${ip}`, 240, 60 * 60 * 1000, client)
  const reviewId = requireUuidParam(event, 'id')
  return setReviewLike(client, reviewId, session.user.id, false)
})
