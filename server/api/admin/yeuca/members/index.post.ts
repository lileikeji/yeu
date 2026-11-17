import { createYeucaMemberSchema } from '../../../../../shared/schemas/yeuca'
import { createYeucaMemberAdmin } from '../../../../modules/yeuca/member-service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody } from '../../../../utils/validation'
import { resolveYeucaAdminScope } from '../../../../utils/yeuca-admin'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  resolveYeucaAdminScope(client, session)
  const input = await parseBody(event, createYeucaMemberSchema)
  const member = await createYeucaMemberAdmin(client, session.admin.id, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.member.create',
    entityType: 'yeuca_member',
    entityId: member.id,
    details: { studentNo: member.studentNo, department: member.department, status: member.memberStatus }
  })
  setResponseStatus(event, 201)
  return member
})
