import { createYeucaActivitySchema } from '../../../../../shared/schemas/yeuca'
import { createYeucaActivityAdmin } from '../../../../modules/yeuca/activity-service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody } from '../../../../utils/validation'
import { resolveYeucaAdminScope, resolveYeucaScopedDepartment } from '../../../../utils/yeuca-admin'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const scope = resolveYeucaAdminScope(client, session)
  const input = await parseBody(event, createYeucaActivitySchema)
  const activity = createYeucaActivityAdmin(client, session.admin.id, {
    ...input,
    deptName: resolveYeucaScopedDepartment(scope, input.deptName)
  })
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.activity.create',
    entityType: 'yeuca_activity',
    entityId: activity.id,
    details: { title: activity.title, department: activity.deptName, status: activity.status }
  })
  setResponseStatus(event, 201)
  return activity
})
