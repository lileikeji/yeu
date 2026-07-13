import { adminProceduresQuerySchema } from '../../../../shared/schemas/server'
import { listProcedures } from '../../../modules/procedures/service'
import { useAdminRequest } from '../../../utils/http'
import { parseQuery } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  return listProcedures(client, parseQuery(event, adminProceduresQuerySchema), false)
})
