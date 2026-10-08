import { publicContentQuerySchema } from '../../../../../shared/schemas/server'
import { listContent } from '../../../../modules/content/service'
import { useAppDatabase } from '../../../../utils/database'
import { setPublicCache } from '../../../../utils/http'
import { presentPublicContent, presentPublicList } from '../../../../utils/public-api-presentation'
import { parseQuery } from '../../../../utils/validation'

export default defineEventHandler((event) => {
  const query = parseQuery(event, publicContentQuerySchema)
  const result = listContent(useAppDatabase(event), query, true, 'guide')
  setPublicCache(event, 60)
  return presentPublicList(result, presentPublicContent)
})
