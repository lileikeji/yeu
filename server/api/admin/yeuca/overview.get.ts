import { getAdminYeucaOverview } from '../../../modules/yeuca/service'
import { useAdminRequest } from '../../../utils/http'
import { resolveYeucaAdminScope } from '../../../utils/yeuca-admin'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const scope = resolveYeucaAdminScope(client, session)
  return await getAdminYeucaOverview(client, scope)
})
