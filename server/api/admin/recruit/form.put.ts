import { updateRecruitFormSchema } from '../../../../shared/schemas/server'
import {
  ensureRecruitForm,
  getClubContent,
  serializeFormConfig,
  updateRecruitForm
} from '../../../modules/recruit/service'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { parseBody } from '../../../utils/validation'
import { resolveRecruitContentId } from '../../../utils/recruit-admin'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveRecruitContentId(event, session)
  const input = await parseBody(event, updateRecruitFormSchema)

  const existing = ensureRecruitForm(client, contentId)
  if (typeof input.baseUpdatedAt === 'number'
    && existing.updatedAt != null
    && Number(existing.updatedAt) !== input.baseUpdatedAt) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Recruit form was modified elsewhere',
      data: { code: 'RECRUIT_FORM_CONFLICT' }
    })
  }

  const row = updateRecruitForm(client, contentId, input)
  const club = getClubContent(client, contentId)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'recruit.form_update',
    entityType: 'recruit_form',
    entityId: row.id,
    details: { contentId, status: row.status, fields: input.fields.length }
  })
  return { form: serializeFormConfig(row, { slug: club?.slug ?? '', title: club?.title ?? '' }) }
})
