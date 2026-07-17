import { userLoginSchema } from '../../../shared/schemas/server'
import { loginAppUser } from '../../utils/user-auth'
import { useAppDatabase } from '../../utils/database'
import { assertTrustedOrigin } from '../../utils/security'
import { parseBody } from '../../utils/validation'
import { recordVisitorEvent } from '../../modules/visitors/service'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  assertTrustedOrigin(event)
  const input = await parseBody(event, userLoginSchema)
  const client = useAppDatabase(event)
  const session = await loginAppUser(event, client, input.username, input.password)
  try {
    recordVisitorEvent(event, client, {
      action: 'user_login',
      path: '/login',
      userId: session.user.id
    })
  } catch {
    // non-fatal
  }
  return {
    authenticated: true,
    user: session.user,
    csrfToken: session.csrfToken,
    expiresAt: new Date(session.expiresAt).toISOString()
  }
})
