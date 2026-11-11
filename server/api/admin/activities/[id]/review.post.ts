import { reviewActivitySchema } from '../../../../../shared/schemas/server'
import { reviewActivity } from '../../../../modules/activities/service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody, requireUuidParam } from '../../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const id = requireUuidParam(event)
  const input = await parseBody(event, reviewActivitySchema)
  const activity = reviewActivity(client, session, id, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'activity.review',
    entityType: 'activity',
    entityId: id,
    details: { decision: input.decision, note: input.note ?? null }
  })
  return activity
})
