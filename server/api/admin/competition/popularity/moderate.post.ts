import { competitionPopularityModerateSchema } from '../../../../../shared/schemas/server'
import { moderatePopularityBallots } from '../../../../modules/competition/popularity-guard'
import {
  ensureCompetitionEvent,
  getPopularityAdminState
} from '../../../../modules/competition/service'
import { writeAudit } from '../../../../utils/audit'
import { resolveCompetitionContentId } from '../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody } from '../../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const eventRow = ensureCompetitionEvent(client, contentId)
  const input = await parseBody(event, competitionPopularityModerateSchema)

  const result = moderatePopularityBallots(client, eventRow.id, session.admin.id, input)
  const popularity = getPopularityAdminState(client, eventRow.id)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: `competition.popularity_${input.mode}`,
    entityType: 'competition_popularity_ballots',
    entityId: eventRow.id,
    details: {
      mode: input.mode,
      requestedCount: input.ballotIds.length,
      updatedCount: result.updatedCount,
      reason: input.reason ?? ''
    }
  })

  return { ...result, popularity }
})
