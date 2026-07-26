import { sendRedirect } from 'h3'
import { getClientIpAddress } from '../../../utils/client-ip'
import { assertRateLimit } from '../../../utils/rate-limit'

const BAIDU_CAMPUS_PAGE_URL = 'https://map.baidu.com/poi/%E4%BB%B0%E6%81%A9%E5%A4%A7%E5%AD%A6/@13204528,2871631,21z,87t,-16.6h'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'X-Robots-Tag', 'noindex, nofollow')
  assertRateLimit(
    event,
    `public:campus-panorama:${getClientIpAddress(event)}`,
    120,
    60_000
  )
  return sendRedirect(event, BAIDU_CAMPUS_PAGE_URL, 302)
})
