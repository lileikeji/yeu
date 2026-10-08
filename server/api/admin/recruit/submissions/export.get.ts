import {
  buildSubmissionsWorkbook,
  ensureRecruitForm,
  getClubContent,
  listSubmissions
} from '../../../../modules/recruit/service'
import { useAdminRequest } from '../../../../utils/http'
import { resolveRecruitContentId, sendXlsx } from '../../../../utils/recruit-admin'

/** Download the configurable summary workbook (纳新总表). */
export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveRecruitContentId(event, session)
  const form = ensureRecruitForm(client, contentId)
  const club = getClubContent(client, contentId)

  // Collect every submission page-by-page (service caps page size at 100).
  const submissions = []
  let page = 1
  for (;;) {
    const result = listSubmissions(client, form.id, { pageSize: 100, page })
    submissions.push(...result.items)
    if (submissions.length >= result.total || result.items.length === 0) break
    page += 1
  }

  const workbook = buildSubmissionsWorkbook(form, submissions)
  sendXlsx(event, workbook, `纳新总表-${club?.title ?? contentId}.xlsx`)
  return workbook
})
