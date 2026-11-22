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
  if (roundKey === 'final2') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email is not supported for final round 2',
      data: { code: 'EMAIL_ROUND_UNSUPPORTED', message: '决赛第二轮不发通知邮件，请选择初赛、复赛或决赛' }
    })
  }
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
