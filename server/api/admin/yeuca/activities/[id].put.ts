import { updateYeucaActivitySchema } from '../../../../../shared/schemas/yeuca'
import { updateYeucaActivityAdmin } from '../../../../modules/yeuca/activity-service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody, requireUuidParam } from '../../../../utils/validation'
import { resolveYeucaAdminScope } from '../../../../utils/yeuca-admin'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  resolveYeucaAdminScope(client, session)
  const id = requireUuidParam(event)
  const input = await parseBody(event, updateYeucaActivitySchema)
  const activity = updateYeucaActivityAdmin(client, id, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.activity.update',
    entityType: 'yeuca_activity',
    entityId: activity.id,
    details: { fields: Object.keys(input), status: activity.status }
  })
  return activity
})
