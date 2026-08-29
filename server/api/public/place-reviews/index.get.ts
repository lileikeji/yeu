import { createHash } from 'node:crypto'
import { publicPlaceReviewsQuerySchema } from '../../../../shared/schemas/server'
import { listPublicPlaceReviews } from '../../../modules/place-reviews/service'
import { useAppDatabase } from '../../../utils/database'
import { getClientIpAddress } from '../../../utils/client-ip'
import { setPublicCache } from '../../../utils/http'
import { getOptionalUserSession } from '../../../utils/user-auth'
import { parseQuery } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const client = useAppDatabase(event)
  const query = parseQuery(event, publicPlaceReviewsQuerySchema)
  const session = getOptionalUserSession(event, client)
  const identity = session?.user
    ? { userId: session.user.id }
    : {
        // The public list reports whether the CURRENT anonymous visitor has
        // already reviewed this place, so the same process-lifetime salted IP
        // key used by POST is derived here too.
        anonymousKey: createHash('sha256')
          .update(`${process.pid}-${getClientIpAddress(event)}`)
          .digest('hex')
          .slice(0, 32)
      }
  const payload = listPublicPlaceReviews(client, query.placeId, identity, query.sort ?? 'newest')
  setPublicCache(event, 30)
  return payload
})
