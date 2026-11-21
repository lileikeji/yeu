import { createError, getRouterParam } from 'h3'
import { deleteYeucaTreasurePointAdmin } from '../../../../../modules/yeuca/treasure-service'
import { useAdminRequest } from '../../../../../utils/http'
import { resolveYeucaAdminScope } from '../../../../../utils/yeuca-admin'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event, true)
  const scope = resolveYeucaAdminScope(client, session)
  const pointId = (getRouterParam(event, 'id') || '').trim()
  if (!pointId || !/^[a-zA-Z0-9_-]{1,64}$/.test(pointId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid point id', data: { code: 'INVALID_ID' } })
  }
  return deleteYeucaTreasurePointAdmin(client, event, session.admin.id, scope, pointId, useRuntimeConfig(event))
})
