import { getPublicContent } from '../../../../modules/content/service'
import { useAppDatabase } from '../../../../utils/database'
import { setPublicCache } from '../../../../utils/http'
import { presentPublicContent } from '../../../../utils/public-api-presentation'
import { requireSlugParam } from '../../../../utils/validation'

export default defineEventHandler((event) => {
  const guide = getPublicContent(useAppDatabase(event), requireSlugParam(event), 'guide')
  setPublicCache(event, 120)
  return presentPublicContent(guide)
})
