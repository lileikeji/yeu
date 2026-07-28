import { getKnowledgeClaim } from '../../../modules/knowledge/service'
import { requireSuperAdmin } from '../../../utils/auth'
import { useAdminRequest } from '../../../utils/http'
import { requireUuidParam } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  requireSuperAdmin(session)
  return getKnowledgeClaim(client, requireUuidParam(event))
})
