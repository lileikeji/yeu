import {
  buildSampleSubmissionData,
  buildSubmissionDocx,
  ensureRecruitForm
} from '../../../modules/recruit/service'
import { useAdminRequest } from '../../../utils/http'
import { sendDocx, resolveRecruitContentId } from '../../../utils/recruit-admin'

/**
 * Render the uploaded template with sample data so the admin can verify the
 * docx mapping before going live (下载示例文档).
 */
export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveRecruitContentId(event, session)
  const form = ensureRecruitForm(client, contentId)

  const sample: Parameters<typeof buildSubmissionDocx>[1] = {
    id: 'sample',
    formId: form.id,
    referrerName: null,
    paymentConfirmed: null,
    createdAt: Date.now(),
    data: buildSampleSubmissionData(JSON.parse(form.fieldsJson)),
    name: '张三',
    gender: null,
    studentNo: null,
    major: null,
    className: null,
    phone: null,
    qq: null,
    departments: null,
    isLeagueMember: null
  }

  const generated = buildSubmissionDocx(form, sample)
  sendDocx(event, generated.bytes, `示例-${generated.filename}`)
  return generated.bytes
})
