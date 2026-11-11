import { updateCompetitionJudgeSchema } from '../../../../../../../shared/schemas/server'
import {
  ensureCompetitionEvent,
  getRoundByKey,
  updateJudge
} from '../../../../../../modules/competition/service'
import { writeAudit } from '../../../../../../utils/audit'
import {
  requireCompetitionRoundKey,
  resolveCompetitionContentId
} from '../../../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../../../utils/http'
import { parseBody, requireUuidParam } from '../../../../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const roundKey = requireCompetitionRoundKey(event)
  const judgeId = requireUuidParam(event)
  const input = await parseBody(event, updateCompetitionJudgeSchema)

  const competition = ensureCompetitionEvent(client, contentId)
  const round = getRoundByKey(client, competition.id, roundKey)
  const judge = await updateJudge(client, round.id, judgeId, input)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.judge_update',
    entityType: 'competition_judge',
    entityId: judgeId,
    details: { key: roundKey, username: judge.username, displayName: judge.displayName, isActive: judge.isActive }
  })
  return { judge }
})
