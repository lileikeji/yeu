import { updateYeucaProjectSchema } from '../../../../../shared/schemas/yeuca'
import { updateYeucaProject } from '../../../../modules/yeuca/service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody, requireUuidParam } from '../../../../utils/validation'
import { resolveYeucaAdminScope } from '../../../../utils/yeuca-admin'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  resolveYeucaAdminScope(client, session)
  const id = requireUuidParam(event)
  const input = await parseBody(event, updateYeucaProjectSchema)
  const project = updateYeucaProject(client, id, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.project.update',
    entityType: 'yeuca_project',
    entityId: id,
    details: { fields: Object.keys(input) }
  })
  return project
})
