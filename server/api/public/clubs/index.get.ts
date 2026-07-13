import { publicContentQuerySchema } from '../../../../shared/schemas/server'
import { listContent } from '../../../modules/content/service'
import { useAppDatabase } from '../../../utils/database'
import { setPublicCache } from '../../../utils/http'
import { parseQuery } from '../../../utils/validation'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const result = listContent(
    useAppDatabase(event),
    parseQuery(event, publicContentQuerySchema),
    true,
    'club'
  )
  setPublicCache(event, 60)
  return result
})
