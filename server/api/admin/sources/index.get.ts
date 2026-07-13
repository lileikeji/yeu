import { sourcesQuerySchema } from '../../../../shared/schemas/server'
import { listSources } from '../../../modules/verification/service'
import { useAdminRequest } from '../../../utils/http'
import { parseQuery } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  return listSources(client, parseQuery(event, sourcesQuerySchema))
})
