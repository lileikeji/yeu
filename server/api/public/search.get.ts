import { searchQuerySchema } from '../../../shared/schemas/server'
import { searchPublishedContent } from '../../modules/search/service'
import { useAppDatabase } from '../../utils/database'
import { setPublicCache } from '../../utils/http'
import { presentPublicSearchResponse } from '../../utils/public-api-presentation'
import { getClientIpAddress } from '../../utils/client-ip'
import { assertRateLimit } from '../../utils/rate-limit'
import { parseQuery } from '../../utils/validation'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const ipAddress = getClientIpAddress(event)
  const client = useAppDatabase(event)
  assertRateLimit(event, `public-search:${ipAddress}`, 60, 60 * 1000, client)
  const query = parseQuery(event, searchQuerySchema)
  const result = searchPublishedContent(client, query.q, query.limit, query.type)
  setPublicCache(event, 30)
  return presentPublicSearchResponse(result)
})
