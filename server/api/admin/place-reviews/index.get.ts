import { adminPlaceReviewsQuerySchema } from '../../../../shared/schemas/server'
import { adminListPlaceReviews } from '../../../modules/place-reviews/service'
import { useAdminRequest } from '../../../utils/http'
import { parseQuery } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  const query = parseQuery(event, adminPlaceReviewsQuerySchema)
  return adminListPlaceReviews(client, query)
})
