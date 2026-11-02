import { setHeader } from 'h3'
import { getClientIpAddress } from '../../../utils/client-ip'
import { setPublicCache } from '../../../utils/http'
import { assertRateLimit } from '../../../utils/rate-limit'
import { issueTransitTicket } from '../../../utils/transit-guard'

/**
 * 校外公交数据接口的短票据（120 秒，绑定 IP + UA）。
 * 单 IP 每分钟最多 60 张：正常页面 20 秒一刷用不到 10 张。
 */
export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  assertRateLimit(event, `public:transit-ticket:${getClientIpAddress(event)}`, 60, 60_000)
  setPublicCache(event, 0)
  return issueTransitTicket(event)
})
