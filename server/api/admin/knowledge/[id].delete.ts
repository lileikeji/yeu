import { archiveKnowledgeClaim } from '../../../modules/knowledge/service'
import { requireSuperAdmin } from '../../../utils/auth'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { requireUuidParam } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event, true)
  requireSuperAdmin(session)
  const id = requireUuidParam(event)
  archiveKnowledgeClaim(client, id, session.admin.id)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'knowledge.archive',
    entityType: 'knowledge_claim',
    entityId: id
  })
  setResponseStatus(event, 204)
  return null
})
