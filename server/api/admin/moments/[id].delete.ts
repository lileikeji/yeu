import { momentKindSchema } from '../../../../shared/schemas/server'
import { adminDeleteMoment } from '../../../modules/moderation/service'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { requireUuidParam } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const id = requireUuidParam(event)
  const query = parseQueryCompat(event)
  const kind = momentKindSchema.parse(query.kind)
  const deleted = adminDeleteMoment(client, kind, id)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'moment.delete',
    entityType: `moment-${kind}`,
    entityId: id,
    details: { deleted }
  })
  return { deleted }
})

/** DELETE 无 body，kind 走 query；这里用 h3 的 getQuery 简单校验存在性。 */
function parseQueryCompat(event: Parameters<typeof getQuery>[0]): { kind: string } {
  const query = getQuery(event)
  if (typeof query.kind !== 'string' || !query.kind) {
    throw createError({ statusCode: 422, statusMessage: 'kind is required', data: { code: 'MOMENT_KIND_REQUIRED' } })
  }
  return { kind: query.kind }
}
