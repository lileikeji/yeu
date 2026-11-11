import { createActivitySchema } from '../../../../shared/schemas/server'
import { createActivity } from '../../../modules/activities/service'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { parseBody } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const input = await parseBody(event, createActivitySchema)
  const activity = createActivity(client, session, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'activity.create',
    entityType: 'activity',
    entityId: activity.id,
    details: { organizationContentId: activity.organization?.id ?? null }
  })
  setResponseStatus(event, 201)
  return activity
})
