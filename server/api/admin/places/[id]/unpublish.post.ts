import { archivePlace } from '../../../../modules/places/service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { requireUuidParam } from '../../../../utils/validation'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event, true)
  const id = requireUuidParam(event)
  const result = archivePlace(client, id)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'place.unpublish',
    entityType: 'place',
    entityId: id
  })
  return result
})
