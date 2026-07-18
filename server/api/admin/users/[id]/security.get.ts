import { getUserSecurityDossier } from '../../../../modules/admin-security/service'
import { useAdminRequest } from '../../../../utils/http'
import { requireUuidParam } from '../../../../utils/validation'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  const id = requireUuidParam(event, 'id')
  return getUserSecurityDossier(client, id)
})
