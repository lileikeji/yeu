import { competitionPopularityActionSchema } from '../../../../../shared/schemas/server'
import {
  applyPopularityAction,
  ensureCompetitionEvent
} from '../../../../modules/competition/service'
import { writeAudit } from '../../../../utils/audit'
import { resolveCompetitionContentId } from '../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody } from '../../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const eventRow = ensureCompetitionEvent(client, contentId)
  const input = await parseBody(event, competitionPopularityActionSchema)

  const popularity = applyPopularityAction(client, eventRow.id, input.action)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: `competition.popularity_${input.action}`,
    entityType: 'competition_popularity_settings',
    entityId: eventRow.id
  })

  return { popularity }
})
