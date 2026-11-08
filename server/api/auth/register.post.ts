import { userRegisterSchema } from '../../../shared/schemas/server'
import { registerUser } from '../../modules/users/service'
import { loginAppUser } from '../../utils/user-auth'
import { useAppDatabase } from '../../utils/database'
import { getClientIpAddress } from '../../utils/client-ip'
import { assertRateLimit } from '../../utils/rate-limit'
import { assertTrustedOrigin } from '../../utils/security'
import { parseBody } from '../../utils/validation'
import { recordVisitorEvent } from '../../modules/visitors/service'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  assertTrustedOrigin(event)
  const client = useAppDatabase(event)
  const ip = getClientIpAddress(event)
  assertRateLimit(event, `register-ip:${ip}`, 3, 60 * 60 * 1000, client)
  const input = await parseBody(event, userRegisterSchema)
  const user = await registerUser(client, input)
  // 注册即登录（与 loginAppUser 同款会话语义）
  const session = await loginAppUser(event, client, input.username, input.password)
  try {
    recordVisitorEvent(event, client, {
      action: 'user_register',
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
