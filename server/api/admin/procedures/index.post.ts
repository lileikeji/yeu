import { createProcedureSchema } from '../../../../shared/schemas/server'
import { createProcedure } from '../../../modules/procedures/service'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { parseBody } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const result = createProcedure(client, await parseBody(event, createProcedureSchema))
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'procedure.create',
    entityType: 'procedure',
    entityId: result.id,
    details: { slug: result.slug }
  })
  setResponseStatus(event, 201)
  return result
})
