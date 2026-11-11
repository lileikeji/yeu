import { createFeedbackSchema } from '../../../shared/schemas/server'
import { createFeedback } from '../../modules/feedback/service'
import { useAppDatabase } from '../../utils/database'
import { getClientIpAddress } from '../../utils/client-ip'
import { assertRateLimit } from '../../utils/rate-limit'
import { assertTrustedOrigin } from '../../utils/security'
import { parseBody } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const ipAddress = getClientIpAddress(event)
  const client = useAppDatabase(event)
  assertRateLimit(event, `public-feedback:${ipAddress}`, 8, 60 * 60 * 1000, client)
  const input = await parseBody(event, createFeedbackSchema)
  const result = createFeedback(event, client, input, ipAddress)
  setResponseStatus(event, 201)
  return {
    id: result.id,
    status: result.status,
    createdAt: result.createdAt,
    // 用户凭这个号回来查处理进度：GET /api/public/feedback/receipt/:code
    receiptCode: result.receiptCode
  }
})
