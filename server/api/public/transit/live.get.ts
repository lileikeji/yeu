import { createError, getQuery, setHeader } from 'h3'
import type { ApiBusLiveResponse } from '../../../../shared/types/server'
import { isBusLineName } from '../../../modules/transit/bus-lines'
import { busLiveFor } from '../../../modules/transit/mygolbs'
import { getClientIpAddress } from '../../../utils/client-ip'
import { setPublicCache } from '../../../utils/http'
import { assertRateLimit } from '../../../utils/rate-limit'

/**
 * 校外公交实时车辆位置（掌上公交）。
 *
 * 上游缓存 20 秒，页面按同样的节奏轮询；这里给浏览器 10 秒缓存，避免多标签
 * 重复打上游。上游挂了先返回 5 分钟内的旧数据。
 */
export default defineEventHandler(async (event): Promise<ApiBusLiveResponse> => {
  setHeader(event, 'Cache-Control', 'no-store')
  const query = getQuery(event)
  const requested = typeof query.line === 'string' ? query.line : ''
  if (requested && !isBusLineName(requested)) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported bus line' })
  }

  assertRateLimit(event, `public:bus-live:${getClientIpAddress(event)}`, 90, 60_000)

  try {
    const data = await busLiveFor(requested)
    setPublicCache(event, 10)
    return data
  } catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Bus live data unavailable',
      data: { detail: (error as Error).message }
    })
  }
})
