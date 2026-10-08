import { createReferrerSchema } from '../../../../../shared/schemas/server'
import {
  createReferrer,
  ensureRecruitForm,
  listReferrers
} from '../../../../modules/recruit/service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody } from '../../../../utils/validation'
import { resolveRecruitContentId } from '../../../../utils/recruit-admin'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveRecruitContentId(event, session)
  const form = ensureRecruitForm(client, contentId)
  const input = await parseBody(event, createReferrerSchema)

  createReferrer(client, form, input.name, input.code)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'recruit.referrer_create',
    entityType: 'recruit_referrer',
    entityId: contentId,
    details: { name: input.name }
  })
  return { items: listReferrers(client, form.id) }
})
