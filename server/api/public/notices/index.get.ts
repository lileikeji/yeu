import { listPublicNotices } from '../../../modules/notices/service'
import { useAppDatabase } from '../../../utils/database'
import { setPublicCache } from '../../../utils/http'

export default defineEventHandler((event) => {
  // 响应里有按访客计算的 `confirmed`，所以只能 private：浏览器可短暂复用，
  // CDN/边缘仍然 no-store（见 setPublicCache）。原先是无条件 no-store，连浏览器
  // 自己的返回/前进都重新打一次接口。
  // 顺序要紧：先取数据、再挂缓存头，异常路径才不会带上缓存头。
  const notices = listPublicNotices(event, useAppDatabase(event))
  setPublicCache(event, 30)
  return notices
})
