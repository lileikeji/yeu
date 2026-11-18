import { deleteYeucaMemberAdmin, getYeucaMemberById } from '../../../../modules/yeuca/member-service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { requireUuidParam } from '../../../../utils/validation'
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

  await deleteYeucaMemberAdmin(client, id)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.member.delete',
    entityType: 'yeuca_member',
    entityId: id,
    details: {
      studentNo: existing.studentNo,
      name: existing.name,
      department: existing.department,
      gitUsername: existing.gitUsername
    }
  })
  return { deleted: true }
})
