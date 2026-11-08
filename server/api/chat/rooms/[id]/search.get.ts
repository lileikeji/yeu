import { requireUserSession } from '../../../../utils/user-auth'
import { useAppDatabase } from '../../../../utils/database'
import { assertUserCanAccessRoom, getRoomOrThrow, searchRoomMessages } from '../../../../modules/chat/service'
import { assertRateLimit } from '../../../../utils/rate-limit'
import { parseQuery } from '../../../../utils/validation'
import { z } from 'zod'

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(50),
  limit: z.coerce.number().int().min(1).max(50).optional()
}).strict()

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const session = requireUserSession(event, client)
  const roomId = requireUuidParam(event, 'id')
  const room = getRoomOrThrow(client, roomId)
  assertUserCanAccessRoom(client, room, session.user)
  assertRateLimit(event, `chat-search:${session.user.id}`, 30, 60 * 1000, client)
  const query = parseQuery(event, searchQuerySchema)
  return { items: searchRoomMessages(client, roomId, query.q, query.limit ?? 50) }
})
