import { createYeucaPostSchema } from '../../../../../shared/schemas/yeuca'
import { createYeucaPost } from '../../../../modules/yeuca/service'
import { writeAudit } from '../../../../utils/audit'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody } from '../../../../utils/validation'
import { resolveYeucaAdminScope } from '../../../../utils/yeuca-admin'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  resolveYeucaAdminScope(client, session)
  const input = await parseBody(event, createYeucaPostSchema)
  const post = createYeucaPost(client, session.admin.id, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'yeuca.post.create',
    entityType: 'yeuca_post',
    entityId: post.id,
    details: { kind: post.kind, status: post.status }
  })
  setResponseStatus(event, 201)
  return post
})
