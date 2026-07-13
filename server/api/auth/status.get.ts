import { getOptionalAdminSession } from '../../utils/auth'
import { useAppDatabase } from '../../utils/database'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const session = getOptionalAdminSession(event, client)

  if (!session) {
    return { authenticated: false }
  }

  return {
    authenticated: true,
    admin: session.admin,
    csrfToken: session.csrfToken,
    expiresAt: new Date(session.expiresAt).toISOString()
  }
})
