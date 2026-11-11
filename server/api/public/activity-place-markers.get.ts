import { listActivityPlaceIds } from '../../modules/activities/service'
import { useAppDatabase } from '../../utils/database'
import { setPublicCache } from '../../utils/http'

/**
 * 地图只认地点 id：返回有活动的建筑集合，前端合并到 POI 后画红点。
 * 单独接口避免把活动详情塞进公开地点列表，也避免每个地点各查一次。
 */
export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const placeIds = listActivityPlaceIds(useAppDatabase(event))
  setPublicCache(event, 30)
  return { placeIds }
})
