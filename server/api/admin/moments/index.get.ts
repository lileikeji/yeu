import { adminMomentsQuerySchema } from '../../../../shared/schemas/server'
import { adminListMoments } from '../../../modules/moderation/service'
import { useAdminRequest } from '../../../utils/http'
import { parseQuery } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  const query = parseQuery(event, adminMomentsQuerySchema)
  return adminListMoments(client, {
    kind: query.kind,
    status: query.status ?? 'all',
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20
  })
})
