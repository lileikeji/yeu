import { softDeleteAdminMessage } from '../../../../modules/chat/service'
import { useAdminRequest } from '../../../../utils/http'
import { writeAudit } from '../../../../utils/audit'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Message id is required',
      data: { code: 'MESSAGE_ID_REQUIRED' }
    })
  }

  const changed = softDeleteAdminMessage(client, id)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'chat.message_soft_delete',
    entityType: 'chat_message',
    entityId: id,
    details: { changed }
  })
  return { ok: true, changed }
})
