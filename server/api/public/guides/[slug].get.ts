import { getPublicContent } from '../../../modules/content/service'
import { useAppDatabase } from '../../../utils/database'
import { setPublicCache } from '../../../utils/http'
import { requireSlugParam } from '../../../utils/validation'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const slug = requireSlugParam(event)
  const result = getPublicContent(useAppDatabase(event), slug, 'guide')
  setPublicCache(event, 120)
  return result
})
