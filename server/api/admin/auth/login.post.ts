import { loginSchema } from '../../../../shared/schemas/server'
import { adminCapabilities, loginAdmin } from '../../../utils/auth'
import { useAppDatabase } from '../../../utils/database'
import { assertTrustedOrigin } from '../../../utils/security'
import { parseBody } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  // Reject untrusted origins before body parse / scrypt work.
  assertTrustedOrigin(event)
  const input = await parseBody(event, loginSchema)
  const session = await loginAdmin(event, useAppDatabase(event), input.username, input.password)
  return {
    authenticated: true,
    admin: session.admin,
    capabilities: adminCapabilities(session),
    csrfToken: session.csrfToken,
    expiresAt: new Date(session.expiresAt).toISOString()
  }
})
