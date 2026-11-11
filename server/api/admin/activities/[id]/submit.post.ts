import { notifyActivitySubmitted, submitActivity } from '../../../../modules/activities/service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { requireUuidParam } from '../../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const id = requireUuidParam(event)
  const activity = submitActivity(client, session, id)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'activity.submit',
    entityType: 'activity',
    entityId: id
  })
  await notifyActivitySubmitted(activity)
  return activity
})
