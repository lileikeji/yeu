import { listAdminRooms } from '../../../../modules/chat/service'
import { useAdminRequest } from '../../../../utils/http'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  return { items: listAdminRooms(client) }
})
