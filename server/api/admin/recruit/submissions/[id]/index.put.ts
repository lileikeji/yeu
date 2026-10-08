import { publicRecruitSubmissionSchema } from '../../../../../../shared/schemas/server'
import {
  getRecruitFormByContentId,
  updateSubmission
} from '../../../../../modules/recruit/service'
import { writeAudit } from '../../../../../utils/audit'
import { useAdminRequest } from '../../../../../utils/http'
import { parseBody } from '../../../../../utils/validation'
import { resolveRecruitContentId } from '../../../../../utils/recruit-admin'

/** Online edit of one submission; re-validates against the current form fields. */
export default defineEventHandler(async (event) => {
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
  if (!form) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Recruit form not found',
      data: { code: 'NOT_FOUND' }
    })
  }

  const input = await parseBody(event, publicRecruitSubmissionSchema)
  const submission = updateSubmission(client, form, submissionId, input.data)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'recruit.submission_update',
    entityType: 'recruit_submission',
    entityId: submissionId,
    details: { contentId }
  })
  return { submission }
})
