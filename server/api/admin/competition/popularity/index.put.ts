import { competitionPopularitySettingsSchema } from '../../../../../shared/schemas/server'
import {
  ensureCompetitionEvent,
  updatePopularitySettings
} from '../../../../modules/competition/service'
import { writeAudit } from '../../../../utils/audit'
import { resolveCompetitionContentId } from '../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody } from '../../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const eventRow = ensureCompetitionEvent(client, contentId)
  const input = await parseBody(event, competitionPopularitySettingsSchema)

  const popularity = updatePopularitySettings(client, eventRow.id, input)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.popularity_settings',
    entityType: 'competition_popularity_settings',
    entityId: eventRow.id,
    details: {
      enabled: input.enabled,
      allowChange: input.allowChange,
      maxChanges: input.maxChanges,
      votesPerVoter: input.votesPerVoter,
      allowRepeatVote: input.allowRepeatVote,
      qrRotateSeconds: input.qrRotateSeconds,
      showResults: input.showResults
    }
  })

  return { popularity }
})
