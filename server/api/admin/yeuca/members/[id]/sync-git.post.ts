import { getYeucaMemberById, syncYeucaMemberGitAdmin } from '../../../../../modules/yeuca/member-service'
import { writeAudit } from '../../../../../utils/audit'
import { useAdminRequest } from '../../../../../utils/http'
import { requireUuidParam } from '../../../../../utils/validation'
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

  const member = await syncYeucaMemberGitAdmin(client, id)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.member.sync_git',
    entityType: 'yeuca_member',
    entityId: id,
    details: {
      studentNo: member.studentNo,
      department: member.department,
      gitUsername: member.gitUsername,
      gitSynced: member.gitSynced,
      gitSyncError: member.gitSyncError
    }
  })
  return member
})
