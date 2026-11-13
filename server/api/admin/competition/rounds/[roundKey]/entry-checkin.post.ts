import { setCompetitionEntryCheckInSchema } from '../../../../../../shared/schemas/server'
import {
  ensureCompetitionEvent,
  getAdminCompetitionPayload,
  getRoundByKey,
  setEntryCheckIn
} from '../../../../../modules/competition/service'
import { writeAudit } from '../../../../../utils/audit'
import {
  requireCompetitionRoundKey,
  resolveCompetitionContentId
} from '../../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../../utils/http'
import { parseBody } from '../../../../../utils/validation'

/** 现场签到：勾上之后这位选手才进评委名单与顺序评分队列。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const roundKey = requireCompetitionRoundKey(event)
  const input = await parseBody(event, setCompetitionEntryCheckInSchema)

  const competition = ensureCompetitionEvent(client, contentId)
  const round = getRoundByKey(client, competition.id, roundKey)
  setEntryCheckIn(client, round, input.entryId, input.checkedIn)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.entry_checkin',
    entityType: 'competition_round_entry',
    entityId: input.entryId,
    details: { key: roundKey, checkedIn: input.checkedIn }
  })

  return { payload: getAdminCompetitionPayload(client, contentId) }
})
