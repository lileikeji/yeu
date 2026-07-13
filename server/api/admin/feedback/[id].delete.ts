import { deleteFeedback } from '../../../modules/feedback/service'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { requireUuidParam } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event, true)
  const id = requireUuidParam(event)
  deleteFeedback(client, id)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'feedback.delete',
    entityType: 'feedback',
    entityId: id
  })
  setResponseStatus(event, 204)
  return null
})
