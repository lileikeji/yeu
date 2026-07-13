import { logoutAdmin, requireAdminSession } from '../../utils/auth'
import { useAppDatabase } from '../../utils/database'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const session = requireAdminSession(event, client, { csrf: true })
  logoutAdmin(event, client, session)
  return { authenticated: false }
})
