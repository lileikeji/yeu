import { adminAssistantRunsQuerySchema } from '../../../shared/schemas/server'
import { listAssistantRuns } from '../../modules/assistant/analytics'
import { useAdminRequest } from '../../utils/http'
import { parseQuery } from '../../utils/validation'

export default defineEventHandler((event) => {
  const { client } = useAdminRequest(event)
  const query = parseQuery(event, adminAssistantRunsQuerySchema)
  return listAssistantRuns(client, {
    page: query.page,
    pageSize: query.pageSize,
    retrievalPath: query.retrievalPath,
    success: query.success === undefined ? undefined : query.success === 'true',
    q: query.q,
    channel: query.channel
  })
})
