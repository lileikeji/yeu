import { paginationQuerySchema } from '../../../../../shared/schemas/server'
import { listActiveMutes } from '../../../../modules/chat/service'
import { useAdminRequest } from '../../../../utils/http'
import { parseQuery } from '../../../../utils/validation'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  const query = parseQuery(event, paginationQuerySchema)
  return listActiveMutes(client, query)
})
