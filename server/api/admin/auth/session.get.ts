import { getOptionalAdminSession } from '../../../utils/auth'
import { useAppDatabase } from '../../../utils/database'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const session = getOptionalAdminSession(event, useAppDatabase(event))
  return session
    ? {
        authenticated: true,
        admin: session.admin,
        csrfToken: session.csrfToken,
        expiresAt: new Date(session.expiresAt).toISOString()
      }
    : { authenticated: false }
})
