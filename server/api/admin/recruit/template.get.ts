import { getRecruitFormByContentId, getRecruitTemplateBytes } from '../../../modules/recruit/service'
import { throwNotFound } from '../../../utils/errors'
import { useAdminRequest } from '../../../utils/http'
import { resolveRecruitContentId, sendDocx } from '../../../utils/recruit-admin'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveRecruitContentId(event, session)
  const form = getRecruitFormByContentId(client, contentId)
  const bytes = form ? getRecruitTemplateBytes(form) : null
  if (!bytes) throwNotFound('Recruit template')

  sendDocx(event, bytes, form?.templateName || '入会申请表模板.docx')
  return bytes
})
