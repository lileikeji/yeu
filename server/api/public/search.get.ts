import { searchQuerySchema } from '../../../shared/schemas/server'
import { searchPublishedContent } from '../../modules/search/service'
import { useAppDatabase } from '../../utils/database'
import { setPublicCache } from '../../utils/http'
import { parseQuery } from '../../utils/validation'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const query = parseQuery(event, searchQuerySchema)
  const result = searchPublishedContent(useAppDatabase(event), query.q, query.limit, query.type)
  setPublicCache(event, 30)
  return result
})
