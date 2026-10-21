import { updateCompetitionSchema } from '../../../../shared/schemas/server'
import {
  ensureCompetitionEvent,
  getAdminCompetitionPayload,
  updateCompetitionEvent
} from '../../../modules/competition/service'
import { writeAudit } from '../../../utils/audit'
import { resolveCompetitionContentId } from '../../../utils/competition-admin'
import { useAdminRequest } from '../../../utils/http'
import { parseBody } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const input = await parseBody(event, updateCompetitionSchema)

  const existing = ensureCompetitionEvent(client, contentId)
  const row = updateCompetitionEvent(client, existing, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.update',
    entityType: 'competition_event',
    entityId: row.id,
    details: { contentId, dimensions: input.dimensions.length }
  })

  return getAdminCompetitionPayload(client, contentId)
})
