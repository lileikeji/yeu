import {
  ensureRecruitForm,
  listReferrers
} from '../../../../modules/recruit/service'
import { useAdminRequest } from '../../../../utils/http'
import { resolveRecruitContentId } from '../../../../utils/recruit-admin'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveRecruitContentId(event, session)
  const form = ensureRecruitForm(client, contentId)
  return { items: listReferrers(client, form.id) }
})
