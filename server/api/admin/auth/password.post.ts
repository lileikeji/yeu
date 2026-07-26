import { changeAdminPasswordSchema } from '../../../../shared/schemas/server'
import { changeAdminPassword } from '../../../modules/organization-admins/service'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { clearAuthCookies } from '../../../utils/security'
import { parseBody } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const input = await parseBody(event, changeAdminPasswordSchema)
  const result = await changeAdminPassword(
    client,
    session.admin.id,
    session.sessionId,
    input.currentPassword,
    input.newPassword
  )
  clearAuthCookies(event)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'auth.password_change',
    entityType: 'admin',
    entityId: session.admin.id
  })
  return result
})
