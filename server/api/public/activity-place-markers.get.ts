import { listActivityHotspots, listActivityPlaceIds } from '../../modules/activities/service'
import { useAppDatabase } from '../../utils/database'
import { setPublicCache } from '../../utils/http'

/**
 * 地图只认地点 id：返回有活动的建筑集合，前端合并到 POI 后画红点。
 * 单独接口避免把活动详情塞进公开地点列表，也避免每个地点各查一次。
 */
export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  // 红点与热点共用同一个时间边界：两次 Date.now() 在毫秒边界上会一个算「还没结束」、一个算「已结束」。
  const now = Date.now()
  const placeIds = listActivityPlaceIds(client, now)
  const hotspots = listActivityHotspots(client, 6, now)
  setPublicCache(event, 30)
  return { placeIds, hotspots }
})
