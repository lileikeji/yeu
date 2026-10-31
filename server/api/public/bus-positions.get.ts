import { getBusSnapshot } from '../../modules/transit/ykt-bus'
import { setPublicCache } from '../../utils/http'

/**
 * 校车实时位置（云一卡通 YKTGetBusCarInfo 轮询封装）。
 * 响应：{ coordinateSystem, fetchedAt, routes[{routeId,routeName,isBack,stops[...]}], buses[...] }
 * 服务端 5s 缓存合并多客户端轮询；线路/站点 10min 缓存。
 */
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const config = useRuntimeConfig(event)
  const openTicket = config.yktOpenTicket
  if (!openTicket) {
    throw createError({ statusCode: 503, statusMessage: 'YKT open ticket not configured' })
  }
  try {
    const amapKey = String(config.amapWebServiceKey || process.env.AMAP_WEB_SERVICE_KEY || '').trim()
    const snapshot = await getBusSnapshot(openTicket, { amapKey })
    setPublicCache(event, 5)
    return snapshot
  } catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage: 'YKT bus positions unavailable',
      message: error instanceof Error ? error.message : String(error)
    })
  }
})
