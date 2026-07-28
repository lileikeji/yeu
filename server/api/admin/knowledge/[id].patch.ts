import { updateKnowledgeClaimSchema } from '../../../../shared/schemas/server'
import { updateKnowledgeClaim } from '../../../modules/knowledge/service'
import { requireSuperAdmin } from '../../../utils/auth'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { parseBody, requireUuidParam } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  requireSuperAdmin(session)
  const id = requireUuidParam(event)
  const input = await parseBody(event, updateKnowledgeClaimSchema)
  const result = updateKnowledgeClaim(client, id, input, session.admin.id)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'knowledge.update',
    entityType: 'knowledge_claim',
    entityId: id,
    details: { fields: Object.keys(input), reviewStatus: result.reviewStatus }
  })
  return result
})
