import { getPublicPlace } from '../../../../modules/places/service'
import { useAppDatabase } from '../../../../utils/database'
import { setPublicCache } from '../../../../utils/http'
import { presentPublicPlace } from '../../../../utils/public-api-presentation'
import { requireSlugParam } from '../../../../utils/validation'

export default defineEventHandler((event) => {
  const place = getPublicPlace(useAppDatabase(event), requireSlugParam(event))
  setPublicCache(event, 120)
  return presentPublicPlace(place)
})
