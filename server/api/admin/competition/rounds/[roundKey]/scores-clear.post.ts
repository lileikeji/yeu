import {
  clearRoundScores,
  ensureCompetitionEvent,
  getAdminCompetitionPayload,
  getRoundByKey
} from '../../../../../modules/competition/service'
import { writeAudit } from '../../../../../utils/audit'
import {
  requireCompetitionRoundKey,
  resolveCompetitionContentId
} from '../../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../../utils/http'

/** 测试用：一键清空本轮所有评分（签到状态保持不动）。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const roundKey = requireCompetitionRoundKey(event)

  const competition = ensureCompetitionEvent(client, contentId)
  const round = getRoundByKey(client, competition.id, roundKey)
  const { cleared } = clearRoundScores(client, round)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.scores_clear',
    entityType: 'competition_round',
    entityId: round.id,
    details: { key: roundKey, cleared }
  })

  return { cleared, payload: getAdminCompetitionPayload(client, contentId) }
})
