import { listActivityComments } from '../../../../modules/activity-comments/service'
import { useAppDatabase } from '../../../../utils/database'
import { setPublicCache } from '../../../../utils/http'
import { requireSlugParam } from '../../../../utils/validation'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const payload = listActivityComments(useAppDatabase(event), requireSlugParam(event))
  setPublicCache(event, 30)
  return payload
})
