import { publicPlaceEventsQuerySchema } from '../../../../shared/schemas/server'
import { listPublishedEventsForPlace } from '../../../modules/signal/service'
import { useAppDatabase } from '../../../utils/database'
import { setPublicCache } from '../../../utils/http'
import { parseQuery } from '../../../utils/validation'

export default defineEventHandler((event) => {
  // 与其他 public GET 路由一致：失败/空响应不缓存，成功后才放宽为 private 短缓存。
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const query = parseQuery(event, publicPlaceEventsQuerySchema)
  // 无关联事件返回空数组（200）而不是 404：前端对空数据整块静默隐藏。
  const events = listPublishedEventsForPlace(client, { slug: query.slug ?? null, name: query.name }, 5)
  setPublicCache(event, 30)
  return { events }
})
