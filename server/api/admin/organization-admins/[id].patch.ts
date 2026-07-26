import { updateOrganizationAdminSchema } from '../../../../shared/schemas/server'
import { updateOrganizationAdmin } from '../../../modules/organization-admins/service'
import { requireSuperAdmin } from '../../../utils/auth'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { parseBody, requireUuidParam } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  requireSuperAdmin(session)
  const adminUserId = requireUuidParam(event)
  const input = await parseBody(event, updateOrganizationAdminSchema)
  const account = await updateOrganizationAdmin(client, adminUserId, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: input.resetPassword ? 'organization_admin.password_reset' : 'organization_admin.update',
    entityType: 'admin',
    entityId: adminUserId,
    details: { isActive: input.isActive }
  })
  return { account }
})
