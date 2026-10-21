import {
  ensureCompetitionEvent,
  getRoundByKey,
  resetJudgePassword
} from '../../../../../../../modules/competition/service'
import { writeAudit } from '../../../../../../../utils/audit'
import {
  requireCompetitionRoundKey,
  resolveCompetitionContentId
} from '../../../../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../../../../utils/http'
import { requireUuidParam } from '../../../../../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const roundKey = requireCompetitionRoundKey(event)
  const judgeId = requireUuidParam(event)

  const competition = ensureCompetitionEvent(client, contentId)
  const round = getRoundByKey(client, competition.id, roundKey)
  const password = await resetJudgePassword(client, round.id, judgeId)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.judge_password_reset',
    entityType: 'competition_judge',
    entityId: judgeId,
    details: { key: roundKey }
  })
  return { password }
})
