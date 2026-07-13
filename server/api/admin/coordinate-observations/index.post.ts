import { createCoordinateObservationSchema } from '../../../../shared/schemas/server'
import { createCoordinateObservation } from '../../../modules/places/coordinate-observations'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { parseBody } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const result = createCoordinateObservation(
    client,
    await parseBody(event, createCoordinateObservationSchema)
  )
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'coordinate_observation.create',
    entityType: 'place_coordinate_observation',
    entityId: result.id,
    details: {
      placeId: result.placeId,
      accuracyMeters: result.accuracyMeters,
      sampleCount: result.sampleCount,
      pointRole: result.pointRole
    }
  })
  setResponseStatus(event, 201)
  return result
})
