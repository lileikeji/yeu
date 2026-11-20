import { deleteYeucaProject, getYeucaProjectById } from '../../../../modules/yeuca/service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { requireUuidParam } from '../../../../utils/validation'
import { assertYeucaDepartmentAccess, resolveYeucaAdminScope } from '../../../../utils/yeuca-admin'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event, true)
  const scope = resolveYeucaAdminScope(client, session)
  const id = requireUuidParam(event)
  const existing = getYeucaProjectById(client, id)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found', data: { code: 'NOT_FOUND' } })
  }
  assertYeucaDepartmentAccess(scope, existing.deptName, '项目')

  deleteYeucaProject(client, id)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.project.delete',
    entityType: 'yeuca_project',
    entityId: id,
    details: { title: existing.title, department: existing.deptName }
  })
  return { deleted: true }
})
