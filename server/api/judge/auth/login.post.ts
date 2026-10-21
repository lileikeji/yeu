import { judgeLoginSchema } from '../../../../shared/schemas/server'
import { useAppDatabase } from '../../../utils/database'
import { loginCompetitionJudge } from '../../../utils/judge-auth'
import { parseBody } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const input = await parseBody(event, judgeLoginSchema)
  const session = await loginCompetitionJudge(
    event,
    useAppDatabase(event),
    input.username,
    input.password
  )

  return {
    authenticated: true,
    judge: session.judge,
    csrfToken: session.csrfToken,
    expiresAt: new Date(session.expiresAt).toISOString()
  }
})
