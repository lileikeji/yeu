import { publicPlaceReviewsQuerySchema } from '../../../../shared/schemas/server'
import { listPublicPlaceReviews } from '../../../modules/place-reviews/service'
import { useAppDatabase } from '../../../utils/database'
import { setPublicCache } from '../../../utils/http'
import { getOptionalUserSession } from '../../../utils/user-auth'
import { parseQuery } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const client = useAppDatabase(event)
  const query = parseQuery(event, publicPlaceReviewsQuerySchema)
  const session = getOptionalUserSession(event, client)
  const payload = listPublicPlaceReviews(client, query.placeId, session?.user.id ?? null)
  setPublicCache(event, 30)
  return payload
})
