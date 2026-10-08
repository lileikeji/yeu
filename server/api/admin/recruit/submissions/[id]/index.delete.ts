import { deleteSubmission } from '../../../../../modules/recruit/service'
import { writeAudit } from '../../../../../utils/audit'
import { useAdminRequest } from '../../../../../utils/http'
import { resolveRecruitContentId } from '../../../../../utils/recruit-admin'

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

  deleteSubmission(client, submissionId)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'recruit.submission_delete',
    entityType: 'recruit_submission',
    entityId: submissionId,
    details: { contentId }
  })
  return { ok: true }
})
