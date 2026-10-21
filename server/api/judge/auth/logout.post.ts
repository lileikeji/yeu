import { useAppDatabase } from '../../../utils/database'
import { logoutCompetitionJudge, requireJudgeSession } from '../../../utils/judge-auth'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const session = requireJudgeSession(event, client, { csrf: true })
  logoutCompetitionJudge(event, client, session)
  return { authenticated: false }
})
