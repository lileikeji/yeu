import { approveRecruitSubmissionsSchema } from '../../../../../shared/schemas/yeuca'
import { approveRecruitSubmissionsToMembers } from '../../../../modules/yeuca/member-service'
import { ensureYeucaSettings } from '../../../../modules/yeuca/service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody } from '../../../../utils/validation'
import { resolveYeucaAdminScope } from '../../../../utils/yeuca-admin'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const scope = resolveYeucaAdminScope(client, session)
  const settings = ensureYeucaSettings(client)
  if (!settings.contentId) {
    throw createError({ statusCode: 409, statusMessage: 'Computer association content record missing' })
  }
  const input = await parseBody(event, approveRecruitSubmissionsSchema)
  const summary = approveRecruitSubmissionsToMembers(
    client,
    settings.contentId,
    session.admin.id,
    input.submissionIds,
    input.defaultDepartment,
    input.defaultTerm,
    scope.isChief ? null : scope.departmentName
  )
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.recruit.approve_to_members',
    entityType: 'yeuca_member',
    entityId: 'batch',
    details: {
      ...summary,
      department: scope.isChief ? (input.defaultDepartment || '') : (scope.departmentName || '')
    }
  })
  return summary
})
