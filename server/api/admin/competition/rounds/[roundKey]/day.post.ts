import { setCompetitionDaySchema } from '../../../../../../shared/schemas/server'
import {
  ensureCompetitionEvent,
  getAdminCompetitionPayload,
  getRoundByKey,
  setRoundDay
} from '../../../../../modules/competition/service'
import { writeAudit } from '../../../../../utils/audit'
import {
  requireCompetitionRoundKey,
  resolveCompetitionContentId
} from '../../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../../utils/http'
import { parseBody } from '../../../../../utils/validation'

/**
 * 初赛分天：切到第一天/第二天/不分天；`split` 时按出场顺序把名单平分两天。
 * 排行不在这里动，整轮结束后统一出。
 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const roundKey = requireCompetitionRoundKey(event)
  const input = await parseBody(event, setCompetitionDaySchema)

  const competition = ensureCompetitionEvent(client, contentId)
  const round = getRoundByKey(client, competition.id, roundKey)
  setRoundDay(client, round, input.day, input.split === true)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.day',
    entityType: 'competition_round',
    entityId: round.id,
    details: { key: roundKey, day: input.day, split: input.split === true }
  })

  return { payload: getAdminCompetitionPayload(client, contentId) }
})
