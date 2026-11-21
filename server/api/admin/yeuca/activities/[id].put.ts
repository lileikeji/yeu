import { updateYeucaActivitySchema } from '../../../../../shared/schemas/yeuca'
import { getYeucaActivityById, updateYeucaActivityAdmin } from '../../../../modules/yeuca/activity-service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody, requireUuidParam } from '../../../../utils/validation'
import { assertYeucaDepartmentAccess, resolveYeucaAdminScope } from '../../../../utils/yeuca-admin'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const scope = resolveYeucaAdminScope(client, session)
  const id = requireUuidParam(event)
  const existing = getYeucaActivityById(client, id)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Activity not found', data: { code: 'NOT_FOUND' } })
  }
  assertYeucaDepartmentAccess(scope, existing.deptName, '活动')

  const input = await parseBody(event, updateYeucaActivitySchema)
  if (!scope.isChief && input.deptName !== undefined && input.deptName.trim() !== scope.departmentName) {
    assertYeucaDepartmentAccess(scope, input.deptName, '活动（调整部门）')
  }
  const activity = updateYeucaActivityAdmin(client, id, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.activity.update',
    entityType: 'yeuca_activity',
    entityId: activity.id,
    details: { department: activity.deptName, fields: Object.keys(input), status: activity.status }
  })
  return activity
})
