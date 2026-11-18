import { listActivityRegistrationsAdmin } from '../../../../../modules/yeuca/activity-service'
import { useAdminRequest } from '../../../../../utils/http'
import { requireUuidParam } from '../../../../../utils/validation'
import { resolveYeucaAdminScope } from '../../../../../utils/yeuca-admin'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  resolveYeucaAdminScope(client, session)
  const activityId = requireUuidParam(event)
  return listActivityRegistrationsAdmin(client, activityId)
})
