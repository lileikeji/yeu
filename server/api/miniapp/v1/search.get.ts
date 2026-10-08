import { searchQuerySchema } from '../../../../shared/schemas/server'
import { searchPublishedContent } from '../../../modules/search/service'
import { useAppDatabase } from '../../../utils/database'
import { setPublicCache } from '../../../utils/http'
import { presentPublicSearchResponse } from '../../../utils/public-api-presentation'
import { parseQuery } from '../../../utils/validation'

export default defineEventHandler((event) => {
  const query = parseQuery(event, searchQuerySchema)
  const client = useAppDatabase(event)
  const result = searchPublishedContent(client, query.q, query.limit, query.type)
  setPublicCache(event, 30)
  return presentPublicSearchResponse(result)
})
