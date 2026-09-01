import { adminDeleteReview } from '../../../modules/place-reviews/service'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { requireUuidParam } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const id = requireUuidParam(event)
  adminDeleteReview(client, id)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'place_review.delete',
    entityType: 'place-review',
    entityId: id,
    details: {}
  })
  return { ok: true }
})
