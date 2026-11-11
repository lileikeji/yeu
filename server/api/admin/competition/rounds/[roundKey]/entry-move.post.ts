import { moveCompetitionEntrySchema } from '../../../../../../shared/schemas/server'
import {
  ensureCompetitionEvent,
  getAdminCompetitionPayload,
  getRoundByKey,
  moveRoundEntry
} from '../../../../../modules/competition/service'
import { writeAudit } from '../../../../../utils/audit'
import {
  requireCompetitionRoundKey,
  resolveCompetitionContentId
} from '../../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../../utils/http'
import { parseBody } from '../../../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const roundKey = requireCompetitionRoundKey(event)
  const input = await parseBody(event, moveCompetitionEntrySchema)

  const competition = ensureCompetitionEvent(client, contentId)
  const round = getRoundByKey(client, competition.id, roundKey)
  moveRoundEntry(client, round, input.entryId, input.targetId, input.place ?? 'before')

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.entry_move',
    entityType: 'competition_round',
    entityId: round.id,
    details: { key: roundKey, entryId: input.entryId, targetId: input.targetId, place: input.place ?? 'before' }
  })

  return getAdminCompetitionPayload(client, contentId)
})
