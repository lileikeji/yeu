import { getJudgePayload } from '../../modules/competition/service'
import { useJudgeRequest } from '../../utils/http'

export default defineEventHandler((event) => {
  const { client, session } = useJudgeRequest(event)
  return getJudgePayload(client, session.judge)
})
