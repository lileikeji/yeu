import { resetYeucaMemberPasswordSchema } from '../../../../../../shared/schemas/yeuca'
import { getYeucaMemberById, resetYeucaMemberPasswordAdmin } from '../../../../../modules/yeuca/member-service'
import { writeAudit } from '../../../../../utils/audit'
import { useAdminRequest } from '../../../../../utils/http'
import { parseBody, requireUuidParam } from '../../../../../utils/validation'
import { assertYeucaDepartmentAccess, resolveYeucaAdminScope } from '../../../../../utils/yeuca-admin'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const scope = resolveYeucaAdminScope(client, session)
  const id = requireUuidParam(event)
  const existing = getYeucaMemberById(client, id)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Member not found', data: { code: 'NOT_FOUND' } })
  }
  assertYeucaDepartmentAccess(scope, existing.department, '成员')

  const input = await parseBody(event, resetYeucaMemberPasswordSchema)
  const member = await resetYeucaMemberPasswordAdmin(client, id, input.newPassword, input.activateIfPending)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.member.reset_password',
    entityType: 'yeuca_member',
    entityId: id,
    details: {
      studentNo: member.studentNo,
      department: member.department,
      gitUsername: member.gitUsername,
      gitSynced: member.gitSynced,
      gitSyncError: member.gitSyncError,
      status: member.memberStatus
    }
  })
  return member
})
