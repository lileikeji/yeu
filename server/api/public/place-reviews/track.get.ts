import { publicPlaceReviewTrackQuerySchema } from '../../../../shared/schemas/server'
import { findPlaceReviewByTrackCode } from '../../../modules/place-reviews/service'
import { useAppDatabase } from '../../../utils/database'
import { getClientIpAddress } from '../../../utils/client-ip'
import { assertRateLimit } from '../../../utils/rate-limit'
import { setPublicCache } from '../../../utils/http'
import { parseQuery } from '../../../utils/validation'

export default defineEventHandler((event) => {
  // 与其他 public GET 路由一致：失败/404 绝不缓存，成功后才放宽为 private 短缓存。
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const ip = getClientIpAddress(event)
  // 码是 8 位随机字符（约 1.1e12 组合），枚举不可行；限流只防刷接口本身。
  assertRateLimit(event, `place-review-track-ip:${ip}`, 30, 60 * 60 * 1000, client)
  const query = parseQuery(event, publicPlaceReviewTrackQuerySchema)
  const review = findPlaceReviewByTrackCode(client, query.code)
  if (!review) {
    // 面向终端学生的查询接口，statusMessage 直接给中文（先例：server/modules/wechat/share.ts）
    throw createError({ statusCode: 404, statusMessage: '查询码不存在，请核对后重试', data: { code: 'REVIEW_TRACK_NOT_FOUND' } })
  }
  setPublicCache(event, 30)
  return { review }
})
