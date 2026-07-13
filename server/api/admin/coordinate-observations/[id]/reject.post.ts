import { reviewCoordinateObservationSchema } from '../../../../../shared/schemas/server'
import { rejectCoordinateObservation } from '../../../../modules/places/coordinate-observations'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody, requireUuidParam } from '../../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const id = requireUuidParam(event)
  const input = await parseBody(event, reviewCoordinateObservationSchema)
  const result = rejectCoordinateObservation(client, id, session.admin.id, input.note)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'coordinate_observation.reject',
    entityType: 'place_coordinate_observation',
    entityId: id,
    details: { placeId: result.placeId }
  })
  return result
})
