import { z } from 'zod'
import { getClientIpAddress } from '../../../utils/client-ip'
import { useAppDatabase } from '../../../utils/database'
import { assertRateLimit } from '../../../utils/rate-limit'
import { assertTrustedOrigin } from '../../../utils/security'
import { parseBody } from '../../../utils/validation'

const wechatShareDiagnosticSchema = z.object({
  stage: z.enum(['sdk_load', 'signature', 'wx_config', 'share_data']),
  status: z.enum(['success', 'error']),
  message: z.string().trim().max(160).optional(),
  platform: z.enum(['ios', 'android']),
  path: z.string().trim().startsWith('/').max(160)
}).strict()

function sanitizeMessage(message: string | undefined): string | undefined {
  if (!message) return undefined
  return message
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/[a-f0-9]{24,}/gi, '[token]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160) || undefined
}

export default defineEventHandler(async (event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'CDN-Cache-Control', 'no-store')

  const client = useAppDatabase(event)
  const ipAddress = getClientIpAddress(event)
  assertRateLimit(event, `wechat-share-report:${ipAddress}`, 120, 60 * 60 * 1000, client)
  const input = await parseBody(event, wechatShareDiagnosticSchema)

  console.info(JSON.stringify({
    event: 'wechat_share_client',
    stage: input.stage,
    status: input.status,
    platform: input.platform,
    path: input.path,
    message: sanitizeMessage(input.message)
  }))

  return { ok: true }
})
