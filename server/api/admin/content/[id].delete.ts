import { archiveContent } from '../../../modules/content/service'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { requireUuidParam } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event, true)
  const id = requireUuidParam(event)
  const result = archiveContent(client, id)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'content.archive',
    entityType: 'content',
    entityId: id
  })
  return result
})
