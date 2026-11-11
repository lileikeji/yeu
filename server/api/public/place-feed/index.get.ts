import { publicPlaceFeedQuerySchema } from '../../../../shared/schemas/server'
import { listPlaceFeed } from '../../../modules/place-feed/service'
import { useAppDatabase } from '../../../utils/database'
import { setPublicCache } from '../../../utils/http'
import { parseQuery } from '../../../utils/validation'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const query = parseQuery(event, publicPlaceFeedQuerySchema)
  const items = listPlaceFeed(
    useAppDatabase(event),
    { slug: query.slug ?? null, name: query.name ?? null },
    query.limit
  )
  setPublicCache(event, 30)
  return { items }
})
