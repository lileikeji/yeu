import { paginationQuerySchema } from '../../../../../shared/schemas/server'
import { listVisitorEvents } from '../../../../modules/visitors/service'
import { useAdminRequest } from '../../../../utils/http'
import { parseQuery, requireUuidParam } from '../../../../utils/validation'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  const visitorId = requireUuidParam(event, 'id')
  const query = parseQuery(event, paginationQuerySchema)
  return listVisitorEvents(client, visitorId, query)
})
