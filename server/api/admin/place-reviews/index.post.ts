import { createSeedReviewSchema } from '../../../../shared/schemas/server'
import { adminCreateSeedReview } from '../../../modules/place-reviews/service'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { parseBody } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const input = await parseBody(event, createSeedReviewSchema)
  const result = adminCreateSeedReview(client, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'place_review.create_seed',
    entityType: 'place-review',
    entityId: result.id,
    details: { placeId: result.placeId, score: result.score }
  })
  setResponseStatus(event, 201)
  return result
})
