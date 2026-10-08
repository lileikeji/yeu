import { getSecuritySnapshot } from '../../../modules/admin-security/service'
import { requireAdminCapability } from '../../../utils/auth'
import { useAdminRequest } from '../../../utils/http'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  requireAdminCapability(session, 'visitor.raw_ua')
  requireAdminCapability(session, 'visitor.raw_ip')
  return getSecuritySnapshot(client)
})
