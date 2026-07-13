import { publishProcedure } from '../../../../modules/procedures/service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { requireUuidParam } from '../../../../utils/validation'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event, true)
  const id = requireUuidParam(event)
  const result = publishProcedure(client, id)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'procedure.publish',
    entityType: 'procedure',
    entityId: id
  })
  return result
})
