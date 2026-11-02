import { createError, getQuery, setHeader } from 'h3'
import type { ApiBusLinesResponse } from '../../../../shared/types/server'
import { busLines, busLinesFor, isBusLineName } from '../../../modules/transit/bus-lines'
import { getClientIpAddress } from '../../../utils/client-ip'
import { assertRateLimit } from '../../../utils/rate-limit'
import { setPublicCache } from '../../../utils/http'

/**
 * 静态线路快照，不走上游：整份响应 65 KB 左右，直接给长缓存。
 * `?line=K2` 只返回 K2 的两个方向。
 */
export default defineEventHandler((event): ApiBusLinesResponse => {
  // 约定：先 no-store，成功准备数据后才给浏览器短缓存（CDN 恒 no-store）。
  setHeader(event, 'Cache-Control', 'no-store')
  const query = getQuery(event)
  const requested = typeof query.line === 'string' ? query.line : ''
  if (requested && !isBusLineName(requested)) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported bus line' })
  }

  assertRateLimit(event, `public:bus-lines:${getClientIpAddress(event)}`, 120, 60_000)

  setPublicCache(event, 600)

  return {
    provider: busLines.provider,
    city: busLines.city,
    fetchedAt: busLines.fetchedAt,
    lines: busLinesFor(requested),
    vehiclePositionsAvailable: false
  }
})
