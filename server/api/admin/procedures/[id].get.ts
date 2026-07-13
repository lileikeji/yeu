import { getAdminProcedure } from '../../../modules/procedures/service'
import { useAdminRequest } from '../../../utils/http'
import { requireUuidParam } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  return getAdminProcedure(client, requireUuidParam(event))
})
