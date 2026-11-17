import { updateYeucaMemberSchema } from '../../../../../shared/schemas/yeuca'
import { updateYeucaMemberAdmin } from '../../../../modules/yeuca/member-service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody, requireUuidParam } from '../../../../utils/validation'
import { resolveYeucaAdminScope } from '../../../../utils/yeuca-admin'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  resolveYeucaAdminScope(client, session)
  const id = requireUuidParam(event)
  const input = await parseBody(event, updateYeucaMemberSchema)
  const updated = await updateYeucaMemberAdmin(client, id, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.member.update',
    entityType: 'yeuca_member',
    entityId: updated.id,
    details: { fields: Object.keys(input), status: updated.memberStatus, gitSynced: updated.gitSynced }
  })
  return updated
})
