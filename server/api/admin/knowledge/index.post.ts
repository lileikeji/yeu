import { createKnowledgeClaimSchema } from '../../../../shared/schemas/server'
import { createKnowledgeClaim } from '../../../modules/knowledge/service'
import { requireSuperAdmin } from '../../../utils/auth'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { parseBody } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  requireSuperAdmin(session)
  const input = await parseBody(event, createKnowledgeClaimSchema)
  const result = createKnowledgeClaim(client, input, session.admin.id)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'knowledge.create',
    entityType: 'knowledge_claim',
    entityId: result.id,
    details: { category: result.category, reviewStatus: result.reviewStatus }
  })
  setResponseStatus(event, 201)
  return result
})
