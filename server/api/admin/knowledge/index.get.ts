import { adminKnowledgeClaimsQuerySchema } from '../../../../shared/schemas/server'
import { listKnowledgeClaims } from '../../../modules/knowledge/service'
import { requireSuperAdmin } from '../../../utils/auth'
import { useAdminRequest } from '../../../utils/http'
import { parseQuery } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  requireSuperAdmin(session)
  return listKnowledgeClaims(client, parseQuery(event, adminKnowledgeClaimsQuerySchema))
})
