import { createError, getQuery, setHeader } from 'h3'
import type { ApiBusDeparturesResponse } from '../../../../shared/types/server'
import { isBusLineName } from '../../../modules/transit/bus-lines'
import { busDeparturesFor } from '../../../modules/transit/mygolbs'
import { getClientIpAddress } from '../../../utils/client-ip'
import { assertRateLimit } from '../../../utils/rate-limit'
import { setPublicCache } from '../../../utils/http'

/**
 * 校外公交发车时刻表（掌上公交的历史推算值）。
 * 上游半天变一次，这里给 10 分钟浏览器缓存 + 30 分钟服务端缓存。
 */
export default defineEventHandler(async (event): Promise<ApiBusDeparturesResponse> => {
  setHeader(event, 'Cache-Control', 'no-store')
  const query = getQuery(event)
  const requested = typeof query.line === 'string' ? query.line : ''
  if (requested && !isBusLineName(requested)) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported bus line' })
  }

  assertRateLimit(event, `public:bus-departures:${getClientIpAddress(event)}`, 60, 60_000)

  try {
    const data = await busDeparturesFor(requested)
    setPublicCache(event, 600)
    return data
  } catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Bus departure data unavailable',
      data: { detail: (error as Error).message }
    })
  }
})
