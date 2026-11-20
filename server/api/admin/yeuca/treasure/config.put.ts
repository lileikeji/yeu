import { yeucaTreasureConfigSchema } from '../../../../../shared/schemas/yeuca'
import { updateYeucaTreasureConfigAdmin } from '../../../../modules/yeuca/treasure-service'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody } from '../../../../utils/validation'
import { requireYeucaChiefScope } from '../../../../utils/yeuca-admin'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const scope = requireYeucaChiefScope(client, session)
  const input = await parseBody(event, yeucaTreasureConfigSchema)
  return updateYeucaTreasureConfigAdmin(client, event, session.admin.id, scope, input, useRuntimeConfig(event))
})
