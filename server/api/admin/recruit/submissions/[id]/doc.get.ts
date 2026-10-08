import {
  buildSubmissionDocx,
  getRecruitFormByContentId,
  getSubmission
} from '../../../../../modules/recruit/service'
import { throwNotFound } from '../../../../../utils/errors'
import { useAdminRequest } from '../../../../../utils/http'
import { resolveRecruitContentId, sendDocx } from '../../../../../utils/recruit-admin'

/** Download the generated docx for one submission. */
export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveRecruitContentId(event, session)
  const submissionId = getRouterParam(event, 'id')
  if (!submissionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Submission id is required',
      data: { code: 'SUBMISSION_ID_REQUIRED' }
    })
  }

  const form = getRecruitFormByContentId(client, contentId)
  const submission = getSubmission(client, submissionId)
  if (!form || !submission || submission.formId !== form.id) {
    throwNotFound('Recruit submission')
  }

  const generated = buildSubmissionDocx(form, submission)
  sendDocx(event, generated.bytes, generated.filename)
  return generated.bytes
})
