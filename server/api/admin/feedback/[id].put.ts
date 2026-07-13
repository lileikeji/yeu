import { updateFeedbackSchema } from '../../../../shared/schemas/server'
import { updateFeedback } from '../../../modules/feedback/service'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { parseBody, requireUuidParam } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const id = requireUuidParam(event)
  const input = await parseBody(event, updateFeedbackSchema)
  const result = updateFeedback(client, id, input, session.admin.id)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'feedback.update',
    entityType: 'feedback',
    entityId: id,
    details: { fields: Object.keys(input), compatibilityMethod: 'PUT' }
  })
  return result
})
