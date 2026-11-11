import { updateActivitySchema } from '../../../../shared/schemas/server'
import { updateActivity } from '../../../modules/activities/service'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { parseBody, requireUuidParam } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const id = requireUuidParam(event)
  const input = await parseBody(event, updateActivitySchema)
  const activity = updateActivity(client, session, id, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'activity.update',
    entityType: 'activity',
    entityId: id,
    details: { fields: Object.keys(input) }
  })
  return activity
})
