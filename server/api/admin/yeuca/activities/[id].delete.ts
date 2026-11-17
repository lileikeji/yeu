import { deleteYeucaActivityAdmin } from '../../../../modules/yeuca/activity-service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { requireUuidParam } from '../../../../utils/validation'
import { resolveYeucaAdminScope } from '../../../../utils/yeuca-admin'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event, true)
  resolveYeucaAdminScope(client, session)
  const id = requireUuidParam(event)
  deleteYeucaActivityAdmin(client, id)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.activity.delete',
    entityType: 'yeuca_activity',
    entityId: id,
    details: {}
  })
  return { deleted: true }
})
