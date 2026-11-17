import { updateYeucaPostSchema } from '../../../../../shared/schemas/yeuca'
import { updateYeucaPost } from '../../../../modules/yeuca/service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody, requireUuidParam } from '../../../../utils/validation'
import { resolveYeucaAdminScope } from '../../../../utils/yeuca-admin'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  resolveYeucaAdminScope(client, session)
  const id = requireUuidParam(event)
  const input = await parseBody(event, updateYeucaPostSchema)
  const post = updateYeucaPost(client, id, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.post.update',
    entityType: 'yeuca_post',
    entityId: id,
    details: { fields: Object.keys(input) }
  })
  return post
})
