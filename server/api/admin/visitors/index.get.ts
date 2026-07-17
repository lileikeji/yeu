import { adminVisitorsQuerySchema } from '../../../../shared/schemas/server'
import { listVisitors } from '../../../modules/visitors/service'
import { useAdminRequest } from '../../../utils/http'
import { parseQuery } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  const query = parseQuery(event, adminVisitorsQuerySchema)
  return listVisitors(client, query)
})
