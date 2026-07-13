import { updateContentSchema } from '../../../../shared/schemas/server'
import { updateContent } from '../../../modules/content/service'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { parseBody, requireUuidParam } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const id = requireUuidParam(event)
  const input = await parseBody(event, updateContentSchema)
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
