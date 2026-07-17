import { getOptionalUserSession } from '../../utils/user-auth'
import { useAppDatabase } from '../../utils/database'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const session = getOptionalUserSession(event, useAppDatabase(event))
  return session
    ? {
        authenticated: true,
        user: session.user,
        csrfToken: session.csrfToken,
        expiresAt: new Date(session.expiresAt).toISOString()
      }
    : { authenticated: false }
})
