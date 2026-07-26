import { createOrganizationAdminSchema } from '../../../../shared/schemas/server'
import { createOrganizationAdmin } from '../../../modules/organization-admins/service'
import { requireSuperAdmin } from '../../../utils/auth'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { parseBody } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  requireSuperAdmin(session)
  const input = await parseBody(event, createOrganizationAdminSchema)
  const account = await createOrganizationAdmin(client, input, session.admin.id)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'organization_admin.create',
    entityType: 'admin',
    entityId: account.id,
    details: {
      contentId: input.contentId,
      username: account.username
    }
  })
  return { account }
})
