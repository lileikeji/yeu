import { archiveActivity } from '../../../../modules/activities/service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { requireUuidParam } from '../../../../utils/validation'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event, true)
  const id = requireUuidParam(event)
  const activity = archiveActivity(client, session, id)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'activity.archive',
    entityType: 'activity',
    entityId: id
  })
  return activity
})
