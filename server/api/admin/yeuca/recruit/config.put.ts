import { updateYeucaRecruitConfigSchema } from '../../../../../shared/schemas/yeuca'
import { ensureYeucaSettings, updateYeucaRecruitConfig } from '../../../../modules/yeuca/service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody } from '../../../../utils/validation'
import { resolveYeucaAdminScope } from '../../../../utils/yeuca-admin'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  resolveYeucaAdminScope(client, session)
  const settings = ensureYeucaSettings(client)
  if (!settings.contentId) {
    throw createError({ statusCode: 409, statusMessage: 'Computer association content record missing' })
  }
  const input = await parseBody(event, updateYeucaRecruitConfigSchema)
  const next = updateYeucaRecruitConfig(client, settings.contentId, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.recruit.config.update',
    entityType: 'recruit_form',
    entityId: settings.contentId,
    details: { open: next.open, title: next.title }
  })
  return next
})
