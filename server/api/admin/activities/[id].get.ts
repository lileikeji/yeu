import { getAdminActivity } from '../../../modules/activities/service'
import { useAdminRequest } from '../../../utils/http'
import { requireUuidParam } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  return getAdminActivity(client, session, requireUuidParam(event))
})
