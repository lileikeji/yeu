import { coordinateObservationsQuerySchema } from '../../../../shared/schemas/server'
import { listCoordinateObservations } from '../../../modules/places/coordinate-observations'
import { useAdminRequest } from '../../../utils/http'
import { parseQuery } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  return listCoordinateObservations(client, parseQuery(event, coordinateObservationsQuerySchema))
})
