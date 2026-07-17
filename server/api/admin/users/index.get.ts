import { adminUsersQuerySchema } from '../../../../shared/schemas/server'
import { listAppUsers } from '../../../modules/users/service'
import { useAdminRequest } from '../../../utils/http'
import { parseQuery } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  const query = parseQuery(event, adminUsersQuerySchema)
  return listAppUsers(client, query)
})
