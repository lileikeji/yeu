import { publicPlacesQuerySchema } from '../../../../shared/schemas/server'
import { listPlaces } from '../../../modules/places/service'
import { useAppDatabase } from '../../../utils/database'
import { setPublicCache } from '../../../utils/http'
import { parseQuery } from '../../../utils/validation'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const query = parseQuery(event, publicPlacesQuerySchema)
  const result = listPlaces(useAppDatabase(event), query, true)
  setPublicCache(event, 60)
  return result
})
