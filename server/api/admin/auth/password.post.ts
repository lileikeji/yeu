import { changeAdminPasswordSchema } from '../../../../shared/schemas/server'
import { changeAdminPassword } from '../../../modules/organization-admins/service'
import { writeAudit } from '../../../utils/audit'
import { getClientIpAddress } from '../../../utils/client-ip'
import { useAdminRequest } from '../../../utils/http'
import { assertRateLimit } from '../../../utils/rate-limit'
import { clearAuthCookies } from '../../../utils/security'
import { parseBody } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  // Bound brute-forcing the current password on a compromised/leaked session
  // or repeated must-change flows (LOW-3). scrypt verification already costs
  // work per attempt; this keeps the aggregate attempt rate low so a stolen
  // session cannot be used to guess the admin password at speed.
  assertRateLimit(event, `admin-password-change:${getClientIpAddress(event)}`, 6, 5 * 60 * 1000, client)
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
