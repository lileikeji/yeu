import { z } from 'zod'
import { updateActivityRegistrationStatusAdmin } from '../../../../../modules/yeuca/activity-service'
import { writeAudit } from '../../../../../utils/audit'
import { useAdminRequest } from '../../../../../utils/http'
import { parseBody } from '../../../../../utils/validation'
import { resolveYeucaAdminScope } from '../../../../../utils/yeuca-admin'

const bodySchema = z.object({
  status: z.enum(['registered', 'checked_in', 'cancelled'])
})

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  resolveYeucaAdminScope(client, session)
  const regId = getRouterParam(event, 'regId') || ''
  if (!regId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing regId' })
  }
  const input = await parseBody(event, bodySchema)
  updateActivityRegistrationStatusAdmin(client, regId, input.status)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.activity.registration.status',
    entityType: 'yeuca_activity_registration',
    entityId: regId,
    details: { status: input.status }
  })
  return { ok: true, status: input.status }
})
