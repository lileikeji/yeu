import { adminContentQuerySchema } from '../../../../shared/schemas/server'
import { listContent } from '../../../modules/content/service'
import { useAdminRequest } from '../../../utils/http'
import { parseQuery } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  return listContent(client, parseQuery(event, adminContentQuerySchema), false)
})
