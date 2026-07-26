import { getAdminDeviceConfig, issueAdminDeviceChallenge } from '../../../../utils/admin-device-auth'
import { getClientIpAddress } from '../../../../utils/client-ip'
import { useAppDatabase } from '../../../../utils/database'
import { assertRateLimit } from '../../../../utils/rate-limit'
import { assertTrustedOrigin, getSecurityConfig } from '../../../../utils/security'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  assertTrustedOrigin(event)

  const config = getAdminDeviceConfig()
  if (!config) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Device login is not configured',
      data: { code: 'ADMIN_DEVICE_LOGIN_DISABLED' }
    })
  }

  const client = useAppDatabase(event)
  const ip = getClientIpAddress(event)
  assertRateLimit(event, `admin-device-challenge:${ip}`, 12, 60 * 1000, client)

  return issueAdminDeviceChallenge(
    getSecurityConfig(event).secret,
    config.keyId,
    getRequestURL(event).origin
  )
})
