import { importYeucaMembersSchema } from '../../../../../shared/schemas/yeuca'
import { importYeucaMembersAdmin } from '../../../../modules/yeuca/member-service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody } from '../../../../utils/validation'
import { resolveYeucaAdminScope } from '../../../../utils/yeuca-admin'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  resolveYeucaAdminScope(client, session)
  const input = await parseBody(event, importYeucaMembersSchema)
  const summary = importYeucaMembersAdmin(client, session.admin.id, input.mode, input.items)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.member.import',
    entityType: 'yeuca_member',
    entityId: 'batch',
    details: summary
  })
  return summary
})
