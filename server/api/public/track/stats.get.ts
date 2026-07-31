import { publicPageViewStatsQuerySchema } from '../../../../shared/schemas/server'
import { getPublicPageViewStats } from '../../../modules/visitors/service'
import { useAppDatabase } from '../../../utils/database'
import { getClientIpAddress } from '../../../utils/client-ip'
import { assertRateLimit } from '../../../utils/rate-limit'
import { parseQuery } from '../../../utils/validation'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const ip = getClientIpAddress(event)
  assertRateLimit(event, `public-track-stats:${ip}`, 120, 60 * 1000, client)
  const query = parseQuery(event, publicPageViewStatsQuerySchema)
  return getPublicPageViewStats(client, query.path)
})
