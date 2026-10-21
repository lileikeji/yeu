import { getOptionalJudgeSession } from '../../../utils/judge-auth'
import { useAppDatabase } from '../../../utils/database'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const session = getOptionalJudgeSession(event, useAppDatabase(event))
  return session
    ? {
        authenticated: true,
        judge: session.judge,
        csrfToken: session.csrfToken,
        expiresAt: new Date(session.expiresAt).toISOString()
      }
    : { authenticated: false }
})
