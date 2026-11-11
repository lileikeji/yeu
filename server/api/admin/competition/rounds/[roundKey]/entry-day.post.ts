import { setCompetitionEntryDaySchema } from '../../../../../../shared/schemas/server'
import {
  ensureCompetitionEvent,
  getAdminCompetitionPayload,
  getRoundByKey,
  setEntryDay
} from '../../../../../modules/competition/service'
import { writeAudit } from '../../../../../utils/audit'
import {
  requireCompetitionRoundKey,
  resolveCompetitionContentId
} from '../../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../../utils/http'
import { parseBody } from '../../../../../utils/validation'

/** 单条出场名单改到第一天/第二天（null = 不分配）。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const roundKey = requireCompetitionRoundKey(event)
  const input = await parseBody(event, setCompetitionEntryDaySchema)

  const competition = ensureCompetitionEvent(client, contentId)
  const round = getRoundByKey(client, competition.id, roundKey)
  setEntryDay(client, round, input.entryId, input.day)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.entry_day',
    entityType: 'competition_round_entry',
    entityId: input.entryId,
    details: { key: roundKey, day: input.day }
  })

  return { payload: getAdminCompetitionPayload(client, contentId) }
})
