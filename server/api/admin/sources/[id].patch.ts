import { updateSourceSchema } from '../../../../shared/schemas/server'
import { updateSource } from '../../../modules/verification/service'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { parseBody, requireUuidParam } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const id = requireUuidParam(event)
  const input = await parseBody(event, updateSourceSchema)
  const result = updateSource(client, id, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'source.update',
    entityType: 'source',
    entityId: id,
    details: { fields: Object.keys(input) }
  })
  return result
})
