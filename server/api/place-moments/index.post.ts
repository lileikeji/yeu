import { createHash } from 'node:crypto'
import { createPlaceMomentSchema } from '../../../shared/schemas/server'
import { createPlaceMoment } from '../../modules/place-moments/service'
import { moderateMomentRow, moderationConfigFromRuntime } from '../../modules/moderation/service'
import { useAppDatabase } from '../../utils/database'
import { getClientIpAddress } from '../../utils/client-ip'
import { assertRateLimit } from '../../utils/rate-limit'
import { getOptionalUserSession } from '../../utils/user-auth'
import { parseBody } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const ip = getClientIpAddress(event)

  const session = getOptionalUserSession(event, client, { csrf: true })
  const identity = session?.user
    ? { userId: session.user.id }
    : {
        anonymousKey: createHash('sha256')
          .update(`${process.pid}-${ip}`)
          .digest('hex')
          .slice(0, 32)
      }

  // 留言板最怕脚本刷屏：匿名按 IP 限，登录按账号限。
  assertRateLimit(event, `place-moment-ip:${ip}`, 20, 60 * 60 * 1000, client)
  if (identity.userId) {
    assertRateLimit(event, `place-moment:${identity.userId}`, 12, 60 * 60 * 1000, client)
  }

  const input = await parseBody(event, createPlaceMomentSchema)
  // AI 巡检（异步不阻塞提交）：文字留言先审后放；打卡无文本始终即时可见。
  // 只巡检文字留言；纯图片打卡无文本可判。
  const config = moderationConfigFromRuntime(useRuntimeConfig(event))
  const moment = createPlaceMoment(client, input, identity, ip, Boolean(config))
  if (config && moment.body) {
    void moderateMomentRow(client, 'place', moment.id, moment.body, config).catch(() => {})
  }

  setResponseStatus(event, 201)
  return { moment }
})
