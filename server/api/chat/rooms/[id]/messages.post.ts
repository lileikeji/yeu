import { sendChatMessageSchema } from '../../../../../shared/schemas/server'
import { requireUserSession } from '../../../../utils/user-auth'
import { useAppDatabase } from '../../../../utils/database'
import {
  assertUserCanAccessRoom,
  getRoomOrThrow,
  sendMessage
} from '../../../../modules/chat/service'
import { getClientIpAddress } from '../../../../utils/client-ip'
import { assertRateLimit } from '../../../../utils/rate-limit'
import { parseBody, requireUuidParam } from '../../../../utils/validation'
import { recordVisitorEvent } from '../../../../modules/visitors/service'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const session = requireUserSession(event, client, { csrf: true })
  const ip = getClientIpAddress(event)
  assertRateLimit(event, `chat-send:${session.user.id}`, 30, 60 * 1000, client)
  assertRateLimit(event, `chat-send-ip:${ip}`, 60, 60 * 1000, client)
  const roomId = requireUuidParam(event, 'id')
  const room = getRoomOrThrow(client, roomId)
  assertUserCanAccessRoom(client, room, session.user)
  const input = await parseBody(event, sendChatMessageSchema)
  const message = sendMessage(client, room, session.user, input.body)
  try {
    recordVisitorEvent(event, client, {
      action: 'chat_send',
      path: `/chat/${roomId}`,
      userId: session.user.id,
      meta: { roomId }
    })
  } catch {
    // non-fatal
  }
  setResponseStatus(event, 201)
  return { message }
})
