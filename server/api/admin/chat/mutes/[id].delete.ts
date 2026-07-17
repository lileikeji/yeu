import { deactivateMute } from '../../../../modules/chat/service'
import { useAdminRequest } from '../../../../utils/http'
import { writeAudit } from '../../../../utils/audit'
import { requireUuidParam } from '../../../../utils/validation'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  const id = requireUuidParam(event, 'id')
  const ok = deactivateMute(client, id)
  if (!ok) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Mute not found',
      data: { code: 'MUTE_NOT_FOUND' }
    })
  }
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'chat.unmute_user',
    entityType: 'chat_mute',
    entityId: id
  })
  return { ok: true }
})
