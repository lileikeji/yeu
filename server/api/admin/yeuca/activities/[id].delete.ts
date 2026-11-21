import { deleteYeucaActivityAdmin, getYeucaActivityById } from '../../../../modules/yeuca/activity-service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { requireUuidParam } from '../../../../utils/validation'
import { assertYeucaDepartmentAccess, resolveYeucaAdminScope } from '../../../../utils/yeuca-admin'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event, true)
  const scope = resolveYeucaAdminScope(client, session)
  const id = requireUuidParam(event)
  const existing = getYeucaActivityById(client, id)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Activity not found', data: { code: 'NOT_FOUND' } })
  }
  assertYeucaDepartmentAccess(scope, existing.deptName, '活动')

  deleteYeucaActivityAdmin(client, id)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.activity.delete',
    entityType: 'yeuca_activity',
    entityId: id,
    details: { title: existing.title, department: existing.deptName }
  })
  return { deleted: true }
})
