import { userRegistrationCodeSchema } from '../../../shared/schemas/server'
import { requestRegistrationCode } from '../../modules/users/service'
import { createError } from 'h3'
import { sendVerificationCodeEmail, mailerConfigFromEnv } from '../../utils/mailer'
import { assertTrustedOrigin } from '../../utils/security'
import { useAppDatabase } from '../../utils/database'
import { getClientIpAddress } from '../../utils/client-ip'
import { assertRateLimit } from '../../utils/rate-limit'
import { parseBody } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  assertTrustedOrigin(event)
  const client = useAppDatabase(event)
  const ip = getClientIpAddress(event)
  // 防滥用：每 IP 每小时最多 3 次发码
  assertRateLimit(event, `register-code-ip:${ip}`, 3, 60 * 60 * 1000, client)
  const config = mailerConfigFromEnv()
  if (!config) {
    throw createError({ statusCode: 503, statusMessage: '邮件服务暂不可用，请稍后再试', data: { code: 'REG_MAILER_UNAVAILABLE' } })
  }
  const input = await parseBody(event, userRegistrationCodeSchema)
  const result = await requestRegistrationCode(client, input, (to, code) =>
    sendVerificationCodeEmail(config, to, code))
  return result
})
