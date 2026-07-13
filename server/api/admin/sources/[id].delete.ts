import { deleteSource } from '../../../modules/verification/service'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { requireUuidParam } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event, true)
  const id = requireUuidParam(event)
  deleteSource(client, id)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'source.delete',
    entityType: 'source',
    entityId: id
  })
  setResponseStatus(event, 204)
  return null
})
