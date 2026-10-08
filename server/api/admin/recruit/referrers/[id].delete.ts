import {
  deleteReferrer,
  ensureRecruitForm
} from '../../../../modules/recruit/service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { resolveRecruitContentId } from '../../../../utils/recruit-admin'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveRecruitContentId(event, session)
  const referrerId = getRouterParam(event, 'id')
  if (!referrerId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Referrer id is required',
      data: { code: 'REFERRER_ID_REQUIRED' }
    })
  }

  const form = ensureRecruitForm(client, contentId)
  deleteReferrer(client, form.id, referrerId)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'recruit.referrer_delete',
    entityType: 'recruit_referrer',
    entityId: referrerId,
    details: { contentId }
  })
  return { ok: true }
})
