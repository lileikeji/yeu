import { deleteYeucaMemberAdmin } from '../../../../modules/yeuca/member-service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { requireUuidParam } from '../../../../utils/validation'
import { resolveYeucaAdminScope } from '../../../../utils/yeuca-admin'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  resolveYeucaAdminScope(client, session)
  const id = requireUuidParam(event)
  await deleteYeucaMemberAdmin(client, id)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.member.delete',
    entityType: 'yeuca_member',
    entityId: id,
    details: {}
  })
  return { deleted: true }
})
