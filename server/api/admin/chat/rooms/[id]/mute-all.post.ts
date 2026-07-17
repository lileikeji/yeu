import { muteAllChatRoomSchema } from '../../../../../../shared/schemas/server'
import { setRoomMutedAll } from '../../../../../modules/chat/service'
import { useAdminRequest } from '../../../../../utils/http'
import { writeAudit } from '../../../../../utils/audit'
import { parseBody, requireUuidParam } from '../../../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const roomId = requireUuidParam(event, 'id')
  const input = await parseBody(event, muteAllChatRoomSchema)
  setRoomMutedAll(client, roomId, input.muted)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: input.muted ? 'chat.mute_all' : 'chat.unmute_all',
    entityType: 'chat_room',
    entityId: roomId,
    details: { reason: input.reason || null }
  })
  return { ok: true, muted: input.muted }
})
