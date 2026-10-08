import { publicPlacesQuerySchema } from '../../../../../shared/schemas/server'
import { listPlaces } from '../../../../modules/places/service'
import { useAppDatabase } from '../../../../utils/database'
import { setPublicCache } from '../../../../utils/http'
import { presentPublicList, presentPublicPlace } from '../../../../utils/public-api-presentation'
import { parseQuery } from '../../../../utils/validation'

export default defineEventHandler((event) => {
  const query = parseQuery(event, publicPlacesQuerySchema)
  const result = listPlaces(useAppDatabase(event), query, true)
  setPublicCache(event, 60)
  return presentPublicList(result, presentPublicPlace)
})
