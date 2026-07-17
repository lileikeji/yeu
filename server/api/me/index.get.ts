import { requireUserSession } from '../../utils/user-auth'
import { useAppDatabase } from '../../utils/database'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const session = requireUserSession(event, useAppDatabase(event))
  return { user: session.user }
})
