import { loginSchema } from '../../../../shared/schemas/server'
import { adminCapabilities, loginAdmin } from '../../../utils/auth'
import { getClientIpAddress } from '../../../utils/client-ip'
import { useAppDatabase } from '../../../utils/database'
import { assertRateLimit } from '../../../utils/rate-limit'
import { assertTrustedOrigin } from '../../../utils/security'
import { parseBody } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  // Reject untrusted origins before body parse / scrypt work.
  assertTrustedOrigin(event)
  // 管理员登录是公开站点的爆破入口：按 IP 限速（与改密码接口同级的 LOW-3 加固），
  // SQLite 后端让计数跨进程重启存活；成功与失败尝试一并计数。
  const client = useAppDatabase(event)
  assertRateLimit(event, `admin-login:${getClientIpAddress(event)}`, 10, 5 * 60 * 1000, client)
  const input = await parseBody(event, loginSchema)
  const session = await loginAdmin(event, client, input.username, input.password)
  return {
    authenticated: true,
    admin: session.admin,
    capabilities: adminCapabilities(session),
    csrfToken: session.csrfToken,
    expiresAt: new Date(session.expiresAt).toISOString()
  }
})
