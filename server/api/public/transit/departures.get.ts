import { createError, getQuery, setHeader } from 'h3'
import { isBusLineName } from '../../../modules/transit/bus-lines'
import { busDeparturesFor } from '../../../modules/transit/mygolbs'
import { getClientIpAddress } from '../../../utils/client-ip'
import { setPublicCache } from '../../../utils/http'
import { assertRateLimit } from '../../../utils/rate-limit'
import { assertTransitTicket, encodeTransitPayload, transitNonceFrom } from '../../../utils/transit-guard'

/**
 * 校外公交发车时刻表（掌上公交的历史推算值）。
 * 上游半天变一次，这里给 10 分钟浏览器缓存 + 30 分钟服务端缓存。
 */
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const query = getQuery(event)
  const requested = typeof query.line === 'string' ? query.line : ''
  if (requested && !isBusLineName(requested)) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported bus line' })
  }

  // 票据先校验：401/403 不能被下面的 502 兜底吞掉。
  const signature = assertTransitTicket(event)

  assertRateLimit(event, `public:bus-departures:${getClientIpAddress(event)}`, 60, 60_000)

  try {
    const data = await busDeparturesFor(requested)
    setPublicCache(event, 0)
    return encodeTransitPayload(signature, transitNonceFrom(event), data)
  } catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Bus departure data unavailable',
      data: { detail: (error as Error).message }
    })
  }
})
