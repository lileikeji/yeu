import { updatePlaceSchema } from '../../../../shared/schemas/server'
import { updatePlace } from '../../../modules/places/service'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { parseBody, requireUuidParam } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const id = requireUuidParam(event)
  const input = await parseBody(event, updatePlaceSchema)
  const result = updatePlace(client, id, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'place.update',
    entityType: 'place',
    entityId: id,
    details: { fields: Object.keys(input) }
  })
  return result
})
