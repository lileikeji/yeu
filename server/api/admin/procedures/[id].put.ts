import { z } from 'zod'
import { updateProcedureSchema } from '../../../../shared/schemas/server'
import {
  archiveProcedure,
  getAdminProcedure,
  publishProcedure,
  updateProcedure
} from '../../../modules/procedures/service'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { parseBody, requireUuidParam } from '../../../utils/validation'

const compatibilitySchema = updateProcedureSchema.extend({
  status: z.enum(['published', 'archived']).optional()
})

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const id = requireUuidParam(event)
  const input = await parseBody(event, compatibilitySchema)
  const { status, ...fields } = input
  const updated = Object.keys(fields).length > 0
    ? updateProcedure(client, id, fields)
    : getAdminProcedure(client, id)
  const result = status === 'published'
    ? publishProcedure(client, id)
    : status === 'archived'
      ? archiveProcedure(client, id)
      : updated
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: status ? `procedure.${status}` : 'procedure.update',
    entityType: 'procedure',
    entityId: id,
    details: { fields: Object.keys(input), compatibilityMethod: 'PUT' }
  })
  return result
})
