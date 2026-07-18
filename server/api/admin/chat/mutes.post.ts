import { muteChatUserSchema } from '../../../../shared/schemas/server'
import { muteUser } from '../../../modules/chat/service'
import { useAdminRequest } from '../../../utils/http'
import { writeAudit } from '../../../utils/audit'
import { parseBody } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const input = await parseBody(event, muteChatUserSchema)
  const id = muteUser(client, {
    userId: input.userId,
    roomId: input.roomId,
    reason: input.reason,
    expiresAt: input.expiresAt,
    mutedByAdminId: session.admin.id
  })
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'chat.mute_user',
    entityType: 'chat_mute',
    entityId: id,
    details: { userId: input.userId, roomId: input.roomId ?? null, reason: input.reason, expiresAt: input.expiresAt ?? null }
  })
  setResponseStatus(event, 201)
  return { id }
})
