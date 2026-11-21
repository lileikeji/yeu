import { updateYeucaMemberSchema } from '../../../../../shared/schemas/yeuca'
import { getYeucaMemberById, updateYeucaMemberAdmin } from '../../../../modules/yeuca/member-service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody, requireUuidParam } from '../../../../utils/validation'
import { assertYeucaDepartmentAccess, resolveYeucaAdminScope } from '../../../../utils/yeuca-admin'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const scope = resolveYeucaAdminScope(client, session)
  const id = requireUuidParam(event)
  const existing = getYeucaMemberById(client, id)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Member not found', data: { code: 'NOT_FOUND' } })
  }
  assertYeucaDepartmentAccess(scope, existing.department, '成员')

  const input = await parseBody(event, updateYeucaMemberSchema)
  if (!scope.isChief) {
    if (input.department !== undefined && input.department.trim() !== scope.departmentName) {
      assertYeucaDepartmentAccess(scope, input.department, '成员（调出部门）')
    }
    if (input.roleTitle !== undefined && ['会长', '副会长'].includes(input.roleTitle.trim())) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Role title restricted',
        data: { code: 'YEUCA_ROLE_FORBIDDEN', message: '部长无权设置会长或副会长职务' }
      })
    }
  }

  const updated = await updateYeucaMemberAdmin(client, id, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.member.update',
    entityType: 'yeuca_member',
    entityId: updated.id,
    details: {
      studentNo: updated.studentNo,
      department: updated.department,
      fields: Object.keys(input),
      status: updated.memberStatus,
      gitSynced: updated.gitSynced,
      gitSyncError: updated.gitSyncError
    }
  })
  return updated
})
