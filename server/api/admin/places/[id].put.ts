import { z } from 'zod'
import { updatePlaceSchema } from '../../../../shared/schemas/server'
import { archivePlace, getAdminPlace, publishPlace, updatePlace } from '../../../modules/places/service'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { parseBody, requireUuidParam } from '../../../utils/validation'

const compatibilitySchema = updatePlaceSchema.extend({
  status: z.enum(['published', 'archived']).optional()
})

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const id = requireUuidParam(event)
  const input = await parseBody(event, compatibilitySchema)
  const { status, ...fields } = input

  const updated = Object.keys(fields).length > 0
    ? updatePlace(client, id, fields)
    : getAdminPlace(client, id)

  const result = status === 'published'
    ? publishPlace(client, id)
    : status === 'archived'
      ? archivePlace(client, id)
      : updated
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: status ? `place.${status}` : 'place.update',
    entityType: 'place',
    entityId: id,
    details: { fields: Object.keys(input), compatibilityMethod: 'PUT' }
  })
  return result
})
