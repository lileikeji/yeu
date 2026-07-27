import { updateContentSchema } from '../../../../shared/schemas/server'
import { updateContent } from '../../../modules/content/service'
import { writeAudit } from '../../../utils/audit'
import {
  assertOrganizationContentUpdateAllowed,
  requireAdminContentAccess
} from '../../../utils/auth'
import { useAdminRequest } from '../../../utils/http'
import { parseBody, requireUuidParam } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const id = requireUuidParam(event)
  requireAdminContentAccess(session, id)
  const input = await parseBody(event, updateContentSchema)
  assertOrganizationContentUpdateAllowed(session, input)
  const result = updateContent(client, id, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'content.update',
    entityType: 'content',
    entityId: id,
    details: { fields: Object.keys(input) }
  })
  return result
})
