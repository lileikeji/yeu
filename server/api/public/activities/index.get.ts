import { publicActivitiesQuerySchema } from '../../../../shared/schemas/server'
import { listPublicActivities } from '../../../modules/activities/service'
import { useAppDatabase } from '../../../utils/database'
import { setPublicCache } from '../../../utils/http'
import { parseQuery } from '../../../utils/validation'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const query = parseQuery(event, publicActivitiesQuerySchema)
  const result = listPublicActivities(useAppDatabase(event), {
    organization: query.organization,
    place: query.place,
    limit: query.limit,
    includePast: query.includePast === 'true'
  })
  setPublicCache(event, 30)
  return result
})
