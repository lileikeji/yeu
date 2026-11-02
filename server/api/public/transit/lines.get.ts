import { createError, getQuery, setHeader } from 'h3'
import { busLines, busLinesFor, isBusLineName } from '../../../modules/transit/bus-lines'
import { busLinesWithGeometry } from '../../../modules/transit/bus-lines-geometry'
import { getClientIpAddress } from '../../../utils/client-ip'
import { setPublicCache } from '../../../utils/http'
import { assertRateLimit } from '../../../utils/rate-limit'
import { assertTransitTicket, encodeTransitPayload, transitNonceFrom } from '../../../utils/transit-guard'

/**
 * 线路数据：高德快照保底（票价、首末班），几何与站序取掌上公交——和实时车辆同一套坐标，
 * 这样地图上不会出现「车在路外」。整份响应 80 KB 上下，给浏览器 10 分钟缓存。
 * `?line=K2` 只返回 K2 的两个方向。
 */
export default defineEventHandler(async (event) => {
  // 约定：先 no-store，成功准备数据后才给浏览器短缓存（CDN 恒 no-store）。
  setHeader(event, 'Cache-Control', 'no-store')
  const query = getQuery(event)
  const requested = typeof query.line === 'string' ? query.line : ''
  if (requested && !isBusLineName(requested)) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported bus line' })
  }

  const signature = assertTransitTicket(event)

  assertRateLimit(event, `public:bus-lines:${getClientIpAddress(event)}`, 120, 60_000)

  const lines = await busLinesWithGeometry(requested).catch(() => busLinesFor(requested))

  setPublicCache(event, 0)
  return encodeTransitPayload(signature, transitNonceFrom(event), {
    provider: busLines.provider,
    city: busLines.city,
    fetchedAt: busLines.fetchedAt,
    lines,
    vehiclePositionsAvailable: false
  })
})
