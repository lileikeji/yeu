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

  const challenge = issueAdminDeviceChallenge(
    getSecurityConfig(event).secret,
    config.keyId,
    getRequestURL(event).origin
  )
  // The keyId is not a secret (it also rides inside the HMAC-protected token
  // payload), but echoing it as a top-level JSON field hands unauthenticated
  // callers a stable deployment identifier for recon/fingerprinting. The
  // device client already knows its own keyId and only needs the token.
  return {
    algorithm: challenge.algorithm,
    token: challenge.token,
    expiresAt: challenge.expiresAt
  }
})
