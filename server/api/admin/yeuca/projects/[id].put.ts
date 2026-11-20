import { updateYeucaProjectSchema } from '../../../../../shared/schemas/yeuca'
import { getYeucaProjectById, updateYeucaProject } from '../../../../modules/yeuca/service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody, requireUuidParam } from '../../../../utils/validation'
import { assertYeucaDepartmentAccess, resolveYeucaAdminScope } from '../../../../utils/yeuca-admin'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const scope = resolveYeucaAdminScope(client, session)
  const id = requireUuidParam(event)
  const existing = getYeucaProjectById(client, id)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found', data: { code: 'NOT_FOUND' } })
  }
  assertYeucaDepartmentAccess(scope, existing.deptName, '项目')

  const input = await parseBody(event, updateYeucaProjectSchema)
  if (!scope.isChief && input.deptName !== undefined && input.deptName.trim() !== scope.departmentName) {
    assertYeucaDepartmentAccess(scope, input.deptName, '项目（调整部门）')
  }
  const project = updateYeucaProject(client, id, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.project.update',
    entityType: 'yeuca_project',
    entityId: id,
    details: { title: project.title, department: project.deptName, fields: Object.keys(input) }
  })
  return project
})
