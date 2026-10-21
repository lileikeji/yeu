import {
  clearRoundRoster,
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

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const roundKey = requireCompetitionRoundKey(event)

  const competition = ensureCompetitionEvent(client, contentId)
  const round = getRoundByKey(client, competition.id, roundKey)
  clearRoundRoster(client, round)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.clear_roster',
    entityType: 'competition_round',
    entityId: round.id,
    details: { key: roundKey }
  })

  return getAdminCompetitionPayload(client, contentId)
})
