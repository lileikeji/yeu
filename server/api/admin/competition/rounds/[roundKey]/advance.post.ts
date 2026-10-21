import {
  ensureCompetitionEvent,
  generateNextRound,
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
  const result = generateNextRound(client, round)

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
