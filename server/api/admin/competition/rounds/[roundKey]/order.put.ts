import { reorderCompetitionRoundSchema } from '../../../../../../shared/schemas/server'
import {
  ensureCompetitionEvent,
  getAdminCompetitionPayload,
  getRoundByKey,
  reorderRoundEntries
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
  const input = await parseBody(event, reorderCompetitionRoundSchema)

  const competition = ensureCompetitionEvent(client, contentId)
  const round = getRoundByKey(client, competition.id, roundKey)
  reorderRoundEntries(client, round, input.entryIds)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.reorder',
    entityType: 'competition_round',
    entityId: round.id,
    details: { key: roundKey, count: input.entryIds.length }
  })

  return getAdminCompetitionPayload(client, contentId)
})
