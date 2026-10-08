import { adminVisitorBansQuerySchema } from '../../../../shared/schemas/server'
import { listVisitorBans } from '../../../modules/visitors/service'
import { requireAdminCapability } from '../../../utils/auth'
import { useAdminRequest } from '../../../utils/http'
import { parseQuery } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  requireAdminCapability(session, 'ban.manage')
  const query = parseQuery(event, adminVisitorBansQuerySchema)
  return listVisitorBans(client, query)
})
