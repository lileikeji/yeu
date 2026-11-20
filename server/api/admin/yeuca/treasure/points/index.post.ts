import { yeucaTreasurePointSchema } from '../../../../../../shared/schemas/yeuca'
import { createYeucaTreasurePointAdmin } from '../../../../../modules/yeuca/treasure-service'
import { useAdminRequest } from '../../../../../utils/http'
import { parseBody } from '../../../../../utils/validation'
import { resolveYeucaAdminScope } from '../../../../../utils/yeuca-admin'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const scope = resolveYeucaAdminScope(client, session)
  const input = await parseBody(event, yeucaTreasurePointSchema)
  const created = createYeucaTreasurePointAdmin(client, event, session.admin.id, scope, input, useRuntimeConfig(event))
  setResponseStatus(event, 201)
  return created
})
