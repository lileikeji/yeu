import { createYeucaMemberSchema } from '../../../../../shared/schemas/yeuca'
import { createYeucaMemberAdmin } from '../../../../modules/yeuca/member-service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody } from '../../../../utils/validation'
import { resolveYeucaAdminScope, resolveYeucaScopedDepartment } from '../../../../utils/yeuca-admin'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const scope = resolveYeucaAdminScope(client, session)
  const input = await parseBody(event, createYeucaMemberSchema)
  const scopedInput = scope.isChief
    ? input
    : {
        ...input,
        department: resolveYeucaScopedDepartment(scope, input.department),
        roleTitle: ['会长', '副会长'].includes(input.roleTitle.trim()) ? '会员' : input.roleTitle
      }
  const member = await createYeucaMemberAdmin(client, session.admin.id, scopedInput)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.member.create',
    entityType: 'yeuca_member',
    entityId: member.id,
    details: {
      studentNo: member.studentNo,
      name: member.name,
      department: member.department,
      status: member.memberStatus,
      gitUsername: member.gitUsername,
      gitSynced: member.gitSynced,
      gitSyncError: member.gitSyncError
    }
  })
  setResponseStatus(event, 201)
  return member
})
