import { updateProcedureSchema } from '../../../../shared/schemas/server'
import { updateProcedure } from '../../../modules/procedures/service'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { parseBody, requireUuidParam } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const id = requireUuidParam(event)
  const input = await parseBody(event, updateProcedureSchema)
  const result = updateProcedure(client, id, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'procedure.update',
    entityType: 'procedure',
    entityId: id,
    details: { fields: Object.keys(input) }
  })
  return result
})
