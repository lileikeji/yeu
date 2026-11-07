import { createHash } from 'node:crypto'
import { publicBusMomentsQuerySchema } from '../../../../shared/schemas/server'
import { listBusMoments } from '../../../modules/transit/bus-moments'
import { useAppDatabase } from '../../../utils/database'
import { getClientIpAddress } from '../../../utils/client-ip'
import { setPublicCache } from '../../../utils/http'
import { parseQuery } from '../../../utils/validation'
import { getOptionalUserSession } from '../../../utils/user-auth'

export default defineEventHandler((event) => {
  // 与其它 public GET 一致：先 no-store，成功后放宽为 private 短缓存。
  // 响应含「我的留言审核状态」（按访客判定），private 缓存不进共享 CDN。
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const query = parseQuery(event, publicBusMomentsQuerySchema)
  const session = getOptionalUserSession(event, client)
  const identity = session?.user
    ? { userId: session.user.id }
    : {
        anonymousKey: createHash('sha256')
          .update(`${process.pid}-${getClientIpAddress(event)}`)
          .digest('hex')
          .slice(0, 32)
      }
  // 15 秒：留言发出去要看得见；校车留言时效性强，比地点留言的 30s 更短。
  const payload = listBusMoments(client, query.busName, 30, identity)
  setPublicCache(event, 15)
  return payload
})
