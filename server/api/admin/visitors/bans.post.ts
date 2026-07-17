import { createVisitorBanSchema } from '../../../../shared/schemas/server'
import { createVisitorBan } from '../../../modules/visitors/service'
import { useAdminRequest } from '../../../utils/http'
import { writeAudit } from '../../../utils/audit'
import { parseBody } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const input = await parseBody(event, createVisitorBanSchema)
  const id = createVisitorBan(client, {
    ...input,
    bannedByAdminId: session.admin.id
  })
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'visitor.ban_create',
    entityType: 'visitor_ban',
    entityId: id,
    details: { scope: input.scope, value: input.value }
  })
  setResponseStatus(event, 201)
  return { id }
})
