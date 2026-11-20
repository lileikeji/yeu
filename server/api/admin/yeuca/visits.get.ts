import { getYeucaVisitOverview } from '../../../modules/yeuca/visit-service'
import { useAdminRequest } from '../../../utils/http'
import { requireYeucaChiefScope } from '../../../utils/yeuca-admin'

/** 后台「访问记录」：概览聚合 + 明细分页一次返回。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  requireYeucaChiefScope(client, session)

  const query = getQuery(event) as Record<string, string | undefined>
  return getYeucaVisitOverview(client, {
    range: query.range,
    ip: query.ip,
    path: query.path,
    onlyBots: query.onlyBots === '1' || query.onlyBots === 'true',
    page: Number(query.page),
    pageSize: Number(query.pageSize)
  })
})
