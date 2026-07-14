import { createCoordinateObservationSchema } from '../../../../shared/schemas/server'
import { createCoordinateObservation } from '../../../modules/places/coordinate-observations'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { parseBody } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const { observation, created } = createCoordinateObservation(
    client,
    await parseBody(event, createCoordinateObservationSchema)
  )
  if (created) {
    writeAudit(client, event, {
      actorAdminId: session.admin.id,
      action: 'coordinate_observation.create',
      entityType: 'place_coordinate_observation',
      entityId: observation.id,
      details: {
        clientObservationId: observation.clientObservationId,
        placeId: observation.placeId,
        accuracyMeters: observation.accuracyMeters,
        sampleCount: observation.sampleCount,
        pointRole: observation.pointRole
      }
    })
  }
  setResponseStatus(event, created ? 201 : 200)
  return observation
})
