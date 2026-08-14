import { createContentSchema } from '../../../../shared/schemas/server'
import { createContent } from '../../../modules/content/service'
import { requireSuperAdmin } from '../../../utils/auth'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { parseBody } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  requireSuperAdmin(session)
  const input = await parseBody(event, createContentSchema)
  const result = createContent(client, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'content.create',
    entityType: 'content',
    entityId: result.id,
    details: { kind: result.kind, slug: result.slug }
  })
  setResponseStatus(event, 201)
  return result
})
