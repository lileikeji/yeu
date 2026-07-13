import { createPlaceSchema } from '../../../../shared/schemas/server'
import { createPlace } from '../../../modules/places/service'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { parseBody } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const input = await parseBody(event, createPlaceSchema)
  const result = createPlace(client, input)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'place.create',
    entityType: 'place',
    entityId: result.id,
    details: { slug: result.slug }
  })
  setResponseStatus(event, 201)
  return result
})
