import { getCookie } from 'h3'
import { getBusSnapshot } from '../../modules/transit/ykt-bus'
import { PAGE_CONTEXT_COOKIE_NAME, isValidPageContextToken } from '../../utils/api-origin'
import { getClientIpAddress } from '../../utils/client-ip'
import { assertRateLimit } from '../../utils/rate-limit'
import { getSecurityConfig } from '../../utils/security'

/**
 * 校车实时位置（云一卡通 YKTGetBusCarInfo 轮询封装）。
 * 响应：{ coordinateSystem, fetchedAt, routes[{routeId,routeName,isBack,stops[...]}], buses[...] }
 * 服务端 5s 缓存合并多客户端轮询；线路/站点 10min 缓存。
 *
 * 防爬（三层）：
 * ① 路径混淆段 bus-rt-d3e2fd11（见 shared/constants/server.ts BUS_POSITIONS_API_PATH）；
 * ② 票闸——必须携带页面渲染签发的 yeu_page_context HMAC 签名 cookie
 *    （HttpOnly，伪造需泄露 NUXT_ADMIN_SESSION_SECRET），curl 直打 403 PAGE_CONTEXT_REQUIRED；
 * ③ 限流——每票 30/min（页面 5s 轮询 = 12/min，留 2.5 倍余量）、每 IP 120/min 兜底。
 * 缓存遵循「先 no-store、成功后才短缓存」约定：setPublicCache 是 private+s-maxage=0
 * （CDN/边缘一律 no-store），只有持票浏览器自用 5s 缓存，票闸不被缓存绕过。
 */
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')

  // ② 票闸：仅接受带有效页面票据的请求
  const security = getSecurityConfig(event)
  const ticket = getCookie(event, PAGE_CONTEXT_COOKIE_NAME)
  if (!ticket || !isValidPageContextToken(ticket, security.secret)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Bus positions require a page ticket',
      data: { code: 'PAGE_CONTEXT_REQUIRED' }
    })
  }

  // ③ 限流：按票据 nonce（每个浏览器会话一个）+ 每 IP 兜底
  const ticketNonce = ticket.split('.')[1] || 'no-nonce'
  assertRateLimit(event, `bus-rt-ticket:${ticketNonce}`, 30, 60 * 1000)
  assertRateLimit(event, `bus-rt-ip:${getClientIpAddress(event)}`, 120, 60 * 1000)

  const config = useRuntimeConfig(event)
  const openTicket = config.yktOpenTicket
  if (!openTicket) {
    throw createError({ statusCode: 503, statusMessage: 'Bus positions service not configured' })
  }
  try {
    const amapKey = String(config.amapWebServiceKey || process.env.AMAP_WEB_SERVICE_KEY || '').trim()
    const snapshot = await getBusSnapshot(openTicket, { amapKey })
    setPublicCache(event, 5)
    return snapshot
  } catch (error) {
    // 细节只进服务端日志；客户端只拿通用文案，防止上游接口/换票机制信息泄漏。
    console.error('[bus-rt] snapshot failed:', error instanceof Error ? error.message : error)
    throw createError({
      statusCode: 502,
      statusMessage: 'Bus positions unavailable',
      message: 'Bus positions are temporarily unavailable'
    })
  }
})
