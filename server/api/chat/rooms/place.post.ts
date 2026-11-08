import { enterPlaceChatRoomSchema } from '../../../../shared/schemas/server'
import { requireUserSession } from '../../../utils/user-auth'
import { useAppDatabase } from '../../../utils/database'
import { enterPlaceChatRoom } from '../../../modules/chat/service'
import { assertRateLimit } from '../../../utils/rate-limit'
import { parseBody } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const session = requireUserSession(event, client, { csrf: true })
  assertRateLimit(event, `chat-place-enter:${session.user.id}`, 30, 60 * 1000, client)
  const input = await parseBody(event, enterPlaceChatRoomSchema)
  const room = enterPlaceChatRoom(client, session.user, input.placeId)
  return { roomId: room.roomId, title: room.title }
})
