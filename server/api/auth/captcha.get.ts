import { createCaptchaChallenge } from '../../utils/captcha'
import { useAppDatabase } from '../../utils/database'
import { getClientIpAddress } from '../../utils/client-ip'
import { assertRateLimit } from '../../utils/rate-limit'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const ip = getClientIpAddress(event)
  // 反扒：图形验证码本身也要限流，防脚本大量拉图刷接口
  assertRateLimit(event, `captcha-ip:${ip}`, 30, 60 * 60 * 1000, client)
  return createCaptchaChallenge()
})
