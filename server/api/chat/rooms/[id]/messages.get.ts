import { chatMessagesQuerySchema } from '../../../../../shared/schemas/server'
import { requireUserSession } from '../../../../utils/user-auth'
import { useAppDatabase } from '../../../../utils/database'
import {
  assertUserCanAccessRoom,
  getRoomOrThrow,
  listMessages
} from '../../../../modules/chat/service'
import { parseQuery, requireUuidParam } from '../../../../utils/validation'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const session = requireUserSession(event, client)
  const roomId = requireUuidParam(event, 'id')
  const room = getRoomOrThrow(client, roomId)
  assertUserCanAccessRoom(client, room, session.user)
  const query = parseQuery(event, chatMessagesQuerySchema)
  return {
    items: listMessages(client, roomId, query)
  }
})
