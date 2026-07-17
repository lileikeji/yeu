import { adminChatMessagesQuerySchema } from '../../../../shared/schemas/server'
import { listAdminMessages } from '../../../modules/chat/service'
import { useAdminRequest } from '../../../utils/http'
import { parseQuery } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  const query = parseQuery(event, adminChatMessagesQuerySchema)
  return listAdminMessages(client, query)
})
