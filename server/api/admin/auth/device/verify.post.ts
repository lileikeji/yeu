import { z } from 'zod'
import {
  getAdminDeviceConfig,
  verifyAndConsumeAdminDeviceProof
} from '../../../../utils/admin-device-auth'
import { loginAdminWithDevice } from '../../../../utils/auth'
import { writeAudit } from '../../../../utils/audit'
import { getClientIpAddress } from '../../../../utils/client-ip'
import { useAppDatabase } from '../../../../utils/database'
import { assertRateLimit } from '../../../../utils/rate-limit'
import { assertTrustedOrigin, getSecurityConfig } from '../../../../utils/security'
import { parseBody } from '../../../../utils/validation'

const deviceProofSchema = z.object({
  keyId: z.string().regex(/^[a-zA-Z0-9._-]{8,80}$/),
  token: z.string().min(32).max(2048),
  signature: z.string().regex(/^[a-zA-Z0-9_-]{80,100}$/)
}).strict()

export default defineEventHandler(async (event) => {
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
  assertRateLimit(event, `admin-device-verify:${ip}`, 6, 15 * 60 * 1000, client)
  const input = await parseBody(event, deviceProofSchema)

  try {
    if (input.keyId !== config.keyId) throw new Error('ADMIN_DEVICE_PROOF_INVALID')
    verifyAndConsumeAdminDeviceProof({
      secret: getSecurityConfig(event).secret,
      config,
      origin: getRequestURL(event).origin,
      token: input.token,
      signature: input.signature
    })
  } catch {
    writeAudit(client, event, {
      actorAdminId: null,
      action: 'auth.device_login_failed',
      entityType: 'admin',
      details: { keyId: input.keyId }
    })
    throw createError({
      statusCode: 401,
      statusMessage: 'Device authentication failed',
      data: { code: 'ADMIN_DEVICE_AUTH_FAILED' }
    })
  }

  const session = loginAdminWithDevice(event, client, config.username, config.keyId)
  return {
    authenticated: true,
    admin: session.admin,
    csrfToken: session.csrfToken,
    expiresAt: new Date(session.expiresAt).toISOString()
  }
})
