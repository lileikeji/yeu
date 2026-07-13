import { adminPlacesQuerySchema } from '../../../../shared/schemas/server'
import { listPlaces } from '../../../modules/places/service'
import { useAdminRequest } from '../../../utils/http'
import { parseQuery } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  return listPlaces(client, parseQuery(event, adminPlacesQuerySchema), false)
})
