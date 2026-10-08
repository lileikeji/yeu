import {
  ensureRecruitForm,
  listSubmissions
} from '../../../../modules/recruit/service'
import { useAdminRequest } from '../../../../utils/http'
import { resolveRecruitContentId } from '../../../../utils/recruit-admin'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveRecruitContentId(event, session)
  const form = ensureRecruitForm(client, contentId)

  const query = getQuery(event)
  const page = Number.parseInt(String(query.page ?? '1'), 10)
  const pageSize = Number.parseInt(String(query.pageSize ?? '20'), 10)

  return listSubmissions(client, form.id, {
    query: typeof query.query === 'string' ? query.query : '',
    page: Number.isFinite(page) ? page : 1,
    pageSize: Number.isFinite(pageSize) ? pageSize : 20
  })
})
