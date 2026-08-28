import { reviewPlaceReviewSchema } from '../../../../shared/schemas/server'
import { adminReviewPlace } from '../../../modules/place-reviews/service'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { parseBody, requireUuidParam } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const id = requireUuidParam(event)
  const input = await parseBody(event, reviewPlaceReviewSchema)
  const result = adminReviewPlace(client, id, input, session.admin.id)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'place_review.review',
    entityType: 'place-review',
    entityId: id,
    details: { status: result.status, placeId: result.placeId, note: input.note ?? null }
  })
  return result
})
