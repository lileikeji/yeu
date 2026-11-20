import { getYeucaActivityById, listActivityRegistrationsAdmin } from '../../../../../modules/yeuca/activity-service'
import { useAdminRequest } from '../../../../../utils/http'
import { requireUuidParam } from '../../../../../utils/validation'
import { assertYeucaDepartmentAccess, resolveYeucaAdminScope } from '../../../../../utils/yeuca-admin'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  const scope = resolveYeucaAdminScope(client, session)
  const activityId = requireUuidParam(event)
  const activity = getYeucaActivityById(client, activityId)
  if (!activity) {
    throw createError({ statusCode: 404, statusMessage: 'Activity not found', data: { code: 'NOT_FOUND' } })
  }
  assertYeucaDepartmentAccess(scope, activity.deptName, '活动报名名单')
  return listActivityRegistrationsAdmin(client, activityId)
})
