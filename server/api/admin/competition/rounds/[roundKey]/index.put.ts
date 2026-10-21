import { updateCompetitionRoundSchema } from '../../../../../../shared/schemas/server'
import {
  ensureCompetitionEvent,
  getAdminCompetitionPayload,
  getRoundByKey,
  updateRound
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
  const input = await parseBody(event, updateCompetitionRoundSchema)

  const competition = ensureCompetitionEvent(client, contentId)
  const round = getRoundByKey(client, competition.id, roundKey)
  const updated = updateRound(client, round, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.round_update',
    entityType: 'competition_round',
    entityId: updated.id,
    details: { key: roundKey, ...input }
  })

  return getAdminCompetitionPayload(client, contentId)
})
