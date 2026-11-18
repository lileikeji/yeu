import { resetYeucaMemberPasswordSchema } from '../../../../../../shared/schemas/yeuca'
import { resetYeucaMemberPasswordAdmin } from '../../../../../modules/yeuca/member-service'
import { writeAudit } from '../../../../../utils/audit'
import { useAdminRequest } from '../../../../../utils/http'
import { parseBody, requireUuidParam } from '../../../../../utils/validation'
import { resolveYeucaAdminScope } from '../../../../../utils/yeuca-admin'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  resolveYeucaAdminScope(client, session)
  const id = requireUuidParam(event)
  const input = await parseBody(event, resetYeucaMemberPasswordSchema)
  const member = await resetYeucaMemberPasswordAdmin(client, id, input.newPassword, input.activateIfPending)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.member.reset_password',
    entityType: 'yeuca_member',
    entityId: id,
    details: { gitSynced: member.gitSynced, status: member.memberStatus }
  })
  return member
})
