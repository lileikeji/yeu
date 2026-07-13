import { createFeedbackSchema } from '../../../shared/schemas/server'
import { createFeedback } from '../../modules/feedback/service'
import { useAppDatabase } from '../../utils/database'
import { assertRateLimit } from '../../utils/rate-limit'
import { assertTrustedOrigin } from '../../utils/security'
import { parseBody } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const trustProxy = process.env.NUXT_TRUST_PROXY === 'true'
  const ipAddress = getRequestIP(event, { xForwardedFor: trustProxy }) || 'unknown'
  assertRateLimit(event, `public-feedback:${ipAddress}`, 8, 60 * 60 * 1000)
  const input = await parseBody(event, createFeedbackSchema)
  const result = createFeedback(event, useAppDatabase(event), input, ipAddress)
  setResponseStatus(event, 201)
  return {
    id: result.id,
    status: result.status,
    createdAt: result.createdAt
  }
})
