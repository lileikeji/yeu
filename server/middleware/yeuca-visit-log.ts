import { createError, getMethod, getRequestURL } from 'h3'
import { isYeucaPublicPath } from '../utils/yeuca-cors'
import { getClientIpAddress } from '../utils/client-ip'
import { useAppDatabase } from '../utils/database'
import {
  isYeucaIpBanned,
  noteYeucaIpBanHit,
  recordYeucaRequest
} from '../modules/yeuca/visit-service'

/**
 * 计协官网公开接口的访问记录与 IP 拦截。
 *
 * 静态页由 nginx 直出，到不了这里；能到的是站点的数据请求和会员接口，
 * 爬虫、漏扫、暴力枚举基本都会落在这几条路径上，所以日志与封禁都挂在这一层。
 * 埋点接口 /track 自己记 page_view，这里跳过，避免同一请求写两行。
 */
const SKIP_SUFFIXES = ['/track']

export default defineEventHandler((event) => {
  const pathname = getRequestURL(event).pathname
  if (!isYeucaPublicPath(pathname)) return
  if (SKIP_SUFFIXES.some(suffix => pathname.endsWith(suffix))) return

  const method = getMethod(event).toUpperCase()
  if (method === 'OPTIONS') return

  const client = useAppDatabase(event)
  const ip = getClientIpAddress(event)

  if (isYeucaIpBanned(client, ip)) {
    noteYeucaIpBanHit(client, ip || '')
    recordYeucaRequest(event, client, { action: 'blocked', status: 403 })
    throw createError({
      statusCode: 403,
      statusMessage: 'Blocked by site owner',
      data: { code: 'YEUCA_IP_BLOCKED' }
    })
  }

  const startedAt = Date.now()
  event.node.res.on('finish', () => {
    recordYeucaRequest(event, client, {
      action: 'api',
      status: event.node.res.statusCode,
      durationMs: Date.now() - startedAt
    })
  })
})
