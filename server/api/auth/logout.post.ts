import { logoutAppUser, requireUserSession } from '../../utils/user-auth'
import { useAppDatabase } from '../../utils/database'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const session = requireUserSession(event, client, { csrf: true })
  logoutAppUser(event, client, session)
  return { authenticated: false }
})
