import { deactivateVisitorBan } from '../../../../modules/visitors/service'
import { requireAdminCapability } from '../../../../utils/auth'
import { useAdminRequest } from '../../../../utils/http'
import { writeAudit } from '../../../../utils/audit'
import { requireUuidParam } from '../../../../utils/validation'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  requireAdminCapability(session, 'ban.manage')
  const id = requireUuidParam(event, 'id')
  const ok = deactivateVisitorBan(client, id)
  if (!ok) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Ban not found',
      data: { code: 'BAN_NOT_FOUND' }
    })
  }
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'visitor.ban_deactivate',
    entityType: 'visitor_ban',
    entityId: id
  })
  return { ok: true }
})
