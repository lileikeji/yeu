import { archiveProcedure } from '../../../modules/procedures/service'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { requireUuidParam } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event, true)
  const id = requireUuidParam(event)
  const result = archiveProcedure(client, id)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'procedure.archive',
    entityType: 'procedure',
    entityId: id
  })
  return result
})
