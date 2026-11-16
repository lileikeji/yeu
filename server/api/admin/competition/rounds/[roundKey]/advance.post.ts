import {
  confirmAdvanceRoster,
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

/** 兼容旧按钮：POST /advance 等同于「确认晋级名单」——只有确认过的名单才会生成下一轮。 */
export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const roundKey = requireCompetitionRoundKey(event)

  const competition = ensureCompetitionEvent(client, contentId)
  const round = getRoundByKey(client, competition.id, roundKey)
  const result = confirmAdvanceRoster(client, round)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.advance',
    entityType: 'competition_round',
    entityId: round.id,
    details: { from: roundKey, advanced: result.advanced }
  })

  return {
    advanced: result.advanced,
    payload: getAdminCompetitionPayload(client, contentId)
  }
})
