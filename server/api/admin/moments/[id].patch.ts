import { moderateMomentActionSchema } from '../../../../shared/schemas/server'
import { adminModerateMoment } from '../../../modules/moderation/service'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { parseBody, requireUuidParam } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const id = requireUuidParam(event)
  const input = await parseBody(event, moderateMomentActionSchema)
  const result = adminModerateMoment(client, {
    kind: input.kind,
    id,
    action: input.action,
    reason: input.reason,
    adminId: session.admin.id
  })
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: input.action === 'withdraw' ? 'moment.withdraw' : 'moment.restore',
    entityType: `moment-${input.kind}`,
    entityId: id,
    details: { reason: input.reason ?? null, status: input.action === 'withdraw' ? 'rejected' : 'approved' }
  })
  return result
})
