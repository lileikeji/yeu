import { getAdminYeucaOverview } from '../../../modules/yeuca/service'
import { useAdminRequest } from '../../../utils/http'
import { resolveYeucaAdminScope } from '../../../utils/yeuca-admin'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  resolveYeucaAdminScope(client, session)
  return getAdminYeucaOverview(client)
})
