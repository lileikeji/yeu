import { loginSchema } from '../../../shared/schemas/server'
import { loginAdmin } from '../../utils/auth'
import { useAppDatabase } from '../../utils/database'
import { parseBody } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const input = await parseBody(event, loginSchema)
  const client = useAppDatabase(event)
  const session = await loginAdmin(event, client, input.username, input.password)

  return {
    authenticated: true,
    admin: session.admin,
    csrfToken: session.csrfToken,
    expiresAt: new Date(session.expiresAt).toISOString()
  }
})
