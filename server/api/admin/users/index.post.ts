import { createAppUserSchema } from '../../../../shared/schemas/server'
import { createAppUser } from '../../../modules/users/service'
import { useAdminRequest } from '../../../utils/http'
import { writeAudit } from '../../../utils/audit'
import { parseBody } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const input = await parseBody(event, createAppUserSchema)
  const user = await createAppUser(client, {
    ...input,
    createdByAdminId: session.admin.id
  })
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'user.create',
    entityType: 'user',
    entityId: user.id,
    details: { username: user.username }
  })
  setResponseStatus(event, 201)
  return { user }
})
