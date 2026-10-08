import { adminVisitorsQuerySchema } from '../../../../shared/schemas/server'
import { listVisitors } from '../../../modules/visitors/service'
import { requireAdminCapability } from '../../../utils/auth'
import { useAdminRequest } from '../../../utils/http'
import { parseQuery } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  requireAdminCapability(session, 'visitor.list')
  requireAdminCapability(session, 'visitor.raw_ua')
  requireAdminCapability(session, 'visitor.raw_ip')
  const query = parseQuery(event, adminVisitorsQuerySchema)
  return listVisitors(client, query)
})
