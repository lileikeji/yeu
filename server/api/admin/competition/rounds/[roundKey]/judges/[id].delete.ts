import {
  deleteJudge,
  ensureCompetitionEvent,
  getRoundByKey
} from '../../../../../../modules/competition/service'
import { writeAudit } from '../../../../../../utils/audit'
import {
  requireCompetitionRoundKey,
  resolveCompetitionContentId
} from '../../../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../../../utils/http'
import { requireUuidParam } from '../../../../../../utils/validation'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const roundKey = requireCompetitionRoundKey(event)
  const judgeId = requireUuidParam(event)

  const competition = ensureCompetitionEvent(client, contentId)
  const round = getRoundByKey(client, competition.id, roundKey)
  deleteJudge(client, round.id, judgeId)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.judge_delete',
    entityType: 'competition_judge',
    entityId: judgeId,
    details: { key: roundKey }
  })
  return { deleted: true }
})
