import { competitionEmailTemplateSchema } from '../../../../../../shared/schemas/server'
import {
  ensureCompetitionEvent,
  updateEmailTemplate
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
  const input = await parseBody(event, competitionEmailTemplateSchema)

  const competition = ensureCompetitionEvent(client, contentId)
  const template = updateEmailTemplate(client, competition.id, roundKey, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.email_template_update',
    entityType: 'competition_event',
    entityId: competition.id,
    details: { roundKey }
  })
  return { template }
})
