import { adminCompetitionScoreSchema } from '../../../../../../shared/schemas/server'
import type { CompetitionScore } from '../../../../../../shared/types'
import {
  adminUpsertRoundScore,
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
import { parseBody } from '../../../../../utils/validation'

/**
 * 后台改分：把某位评委给某位选手的评分整份覆盖（不存在就补录）。
 *
 * 评分进行中、结束之后都能改——现场救场比流程严格更要紧；
 * 平均分、名次、晋级标记都从同一条记录重算，不需要额外刷新动作。
 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const roundKey = requireCompetitionRoundKey(event)
  const input = await parseBody(event, adminCompetitionScoreSchema)

  const competition = ensureCompetitionEvent(client, contentId)
  const round = getRoundByKey(client, competition.id, roundKey)
  const score: CompetitionScore = adminUpsertRoundScore(client, round, input)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.score_update',
    entityType: 'competition_score',
    entityId: score.id,
    details: {
      key: roundKey,
      singerId: input.singerId,
      judgeId: input.judgeId,
      total: score.total
    }
  })

  return {
    payload: getAdminCompetitionPayload(client, contentId),
    score
  }
})
