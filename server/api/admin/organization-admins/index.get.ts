import { listOrganizationAdmins } from '../../../modules/organization-admins/service'
import { requireSuperAdmin } from '../../../utils/auth'
import { useAdminRequest } from '../../../utils/http'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  requireSuperAdmin(session)
  return { items: listOrganizationAdmins(client) }
})
