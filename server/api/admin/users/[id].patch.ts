import { updateAppUserSchema } from '../../../../shared/schemas/server'
import { updateAppUser } from '../../../modules/users/service'
import { useAdminRequest } from '../../../utils/http'
import { writeAudit } from '../../../utils/audit'
import { parseBody, requireUuidParam } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const id = requireUuidParam(event, 'id')
  const input = await parseBody(event, updateAppUserSchema)
  const user = await updateAppUser(client, id, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'user.update',
    entityType: 'user',
    entityId: id,
    details: {
      status: input.status,
      passwordChanged: Boolean(input.password)
    }
  })
  return { user }
})
