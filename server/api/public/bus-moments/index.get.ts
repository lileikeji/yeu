import { publicBusMomentsQuerySchema } from '../../../../shared/schemas/server'
import { listBusMoments } from '../../../modules/transit/bus-moments'
import { useAppDatabase } from '../../../utils/database'
import { setPublicCache } from '../../../utils/http'
import { parseQuery } from '../../../utils/validation'

export default defineEventHandler((event) => {
  // 与其它 public GET 一致：先 no-store，成功后放宽为 private 短缓存。
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const query = parseQuery(event, publicBusMomentsQuerySchema)
  // 15 秒：留言发出去要看得见；校车留言时效性强，比地点留言的 30s 更短。
  const payload = listBusMoments(client, query.busName)
  setPublicCache(event, 15)
  return payload
})
