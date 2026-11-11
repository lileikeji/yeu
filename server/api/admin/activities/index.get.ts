import { adminActivitiesQuerySchema } from '../../../../shared/schemas/server'
import { listAdminActivities } from '../../../modules/activities/service'
import { useAdminRequest } from '../../../utils/http'
import { parseQuery } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  return listAdminActivities(client, session, parseQuery(event, adminActivitiesQuerySchema))
})
