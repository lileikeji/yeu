import { createSourceSchema } from '../../../../shared/schemas/server'
import { createSource } from '../../../modules/verification/service'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { parseBody } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const input = await parseBody(event, createSourceSchema)
  const result = createSource(client, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'source.create',
    entityType: 'source',
    entityId: result.id,
    details: { url: result.url }
  })
  setResponseStatus(event, 201)
  return result
})
