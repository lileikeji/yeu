import { createHash } from 'node:crypto'
import { publicPlaceMomentsQuerySchema } from '../../../../shared/schemas/server'
import { listPlaceMoments } from '../../../modules/place-moments/service'
import { useAppDatabase } from '../../../utils/database'
import { getClientIpAddress } from '../../../utils/client-ip'
import { setPublicCache } from '../../../utils/http'
import { parseQuery } from '../../../utils/validation'
import { getOptionalUserSession } from '../../../utils/user-auth'

export default defineEventHandler((event) => {
  // 与其它 public GET 一致：先声明不可缓存，成功后再由 nginx/CDN 侧短缓存。
  // 这条响应带「我今天打过卡没有」，是按访客算的，不能被共享缓存。
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const query = parseQuery(event, publicPlaceMomentsQuerySchema)
  const session = getOptionalUserSession(event, client)
  const identity = session?.user
    ? { userId: session.user.id }
    : {
        anonymousKey: createHash('sha256')
          .update(`${process.pid}-${getClientIpAddress(event)}`)
          .digest('hex')
          .slice(0, 32)
      }
  const payload = listPlaceMoments(client, query.placeId, identity)
  // 30 秒：留言发出去要看得见，但也不必每个访客都打一次库。
  setPublicCache(event, 30)
  return payload
})
