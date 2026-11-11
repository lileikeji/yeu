import { deleteActivity } from '../../../modules/activities/service'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { requireUuidParam } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event, true)
  const id = requireUuidParam(event)
  deleteActivity(client, session, id)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'activity.delete',
    entityType: 'activity',
    entityId: id
  })
  setResponseStatus(event, 204)
  return null
})
