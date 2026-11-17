import { createYeucaProjectSchema } from '../../../../../shared/schemas/yeuca'
import { createYeucaProject } from '../../../../modules/yeuca/service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody } from '../../../../utils/validation'
import { resolveYeucaAdminScope } from '../../../../utils/yeuca-admin'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  resolveYeucaAdminScope(client, session)
  const input = await parseBody(event, createYeucaProjectSchema)
  const project = createYeucaProject(client, session.admin.id, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.project.create',
    entityType: 'yeuca_project',
    entityId: project.id,
    details: { deptName: project.deptName }
  })
  setResponseStatus(event, 201)
  return project
})
