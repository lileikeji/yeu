import { getSecuritySnapshot } from '../../../modules/admin-security/service'
import { useAdminRequest } from '../../../utils/http'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  return getSecuritySnapshot(client)
})
