import { requireUserSession } from '../../../utils/user-auth'
import { useAppDatabase } from '../../../utils/database'
import { listPlaceChatRooms } from '../../../modules/chat/service'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  requireUserSession(event, client)
  return { items: listPlaceChatRooms(client) }
})
