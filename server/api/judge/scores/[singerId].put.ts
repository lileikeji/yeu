import { submitCompetitionScoreSchema } from '../../../../shared/schemas/server'
import { submitJudgeScore } from '../../../modules/competition/service'
import { useJudgeRequest } from '../../../utils/http'
import { parseBody, requireUuidParam } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useJudgeRequest(event)
  const singerId = requireUuidParam(event, 'singerId')
  const input = await parseBody(event, submitCompetitionScoreSchema)

  const score = submitJudgeScore(client, session.judge, singerId, input)
  return { score }
})
