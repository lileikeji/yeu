import { requireUserSession } from '../../../utils/user-auth'
import { useAppDatabase } from '../../../utils/database'
import { listRoomsForUser } from '../../../modules/chat/service'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const session = requireUserSession(event, client)
  return { items: listRoomsForUser(client, session.user) }
})
