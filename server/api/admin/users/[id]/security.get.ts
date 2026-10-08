import { getUserSecurityDossier } from '../../../../modules/admin-security/service'
import { requireAdminCapability } from '../../../../utils/auth'
import { useAdminRequest } from '../../../../utils/http'
import { requireUuidParam } from '../../../../utils/validation'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  requireAdminCapability(session, 'visitor.detail')
  requireAdminCapability(session, 'visitor.raw_ua')
  requireAdminCapability(session, 'visitor.raw_ip')
  const id = requireUuidParam(event, 'id')
  return getUserSecurityDossier(client, id)
})
