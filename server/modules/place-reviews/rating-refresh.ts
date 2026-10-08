import { and, asc, isNotNull, lte, ne } from 'drizzle-orm'
import type { DatabaseClient } from '../../database/client'
import { placeAmapRatings } from '../../database/schema'
import { fetchAmapRatingByPoiId, type AmapPoiRating } from './amap'
import { upsertAmapRating } from './service'

/**
 * 高德聚合评分的自动刷新。
 *
 * 背景：`place_amap_ratings` 带 7 天 TTL，但过去只有手工脚本
 * （scripts/seed-amap-ratings.ts）会写入，没有任何调度。最后一次抓取 2026-09-05，
 * 09-12 全部过期——此后美食推荐、单店详情、地图评分徽章一起失效，而用户看到的
 * 只是「内置资料暂时没有找到」。这个模块把刷新变成应用自身每天会做的事，
 * 不再依赖有人记得跑脚本。
 *
 * 只刷新「已经过期」的行：TTL 未到的行不会重复请求高德，天然增量且幂等。
 */

export interface AmapRatingRefreshOptions {
  /** Max rows refreshed per run (bounds the outbound work). */
  limit?: number
  /** Delay between AMap requests; the web service is rate limited. */
  delayMs?: number
  /** Injectable for tests. */
  fetchRating?: (key: string, poiId: string) => Promise<AmapPoiRating | null>
  now?: () => number
}

export interface AmapRatingRefreshResult {
  /** Rows whose TTL had passed and were selected for refresh. */
  stale: number
  refreshed: number
  /** Lookup returned nothing (POI removed / renamed): the row is kept as-is. */
  missing: number
  failed: number
  /** AMap daily quota exhausted mid-run: the rest of the batch was deferred. */
  quotaExceeded?: boolean
}

const DEFAULT_LIMIT = 500
const DEFAULT_DELAY_MS = 350

export async function refreshStaleAmapRatings(
  client: DatabaseClient,
  amapKey: string,
  options: AmapRatingRefreshOptions = {}
): Promise<AmapRatingRefreshResult> {
  const result: AmapRatingRefreshResult = { stale: 0, refreshed: 0, missing: 0, failed: 0 }
  const key = amapKey.trim()
  if (!key) return result

  const now = options.now?.() ?? Date.now()
  const limit = Math.max(1, options.limit ?? DEFAULT_LIMIT)
  const delayMs = Math.max(0, options.delayMs ?? DEFAULT_DELAY_MS)
  const fetchRating = options.fetchRating ?? fetchAmapRatingByPoiId

  const staleRows = client.db.select({
    placeId: placeAmapRatings.placeId,
    amapPoiId: placeAmapRatings.amapPoiId
  }).from(placeAmapRatings)
    .where(and(
      lte(placeAmapRatings.expiresAt, now),
      isNotNull(placeAmapRatings.amapPoiId),
      ne(placeAmapRatings.amapPoiId, '')
    ))
    .orderBy(asc(placeAmapRatings.expiresAt))
    .limit(limit)
    .all()
    .filter(row => Boolean(row.amapPoiId.trim()))

  result.stale = staleRows.length
  if (staleRows.length === 0) return result

  for (const [index, row] of staleRows.entries()) {
    try {
      const rating = await fetchRating(key, row.amapPoiId)
      if (!rating) {
        // 高德查不到这个 POI 时不删本地行：宁可继续用旧评分，也不要把已经
        // 在服务的门店从推荐池里抹掉。
        result.missing += 1
      } else {
        upsertAmapRating(client, row.placeId, rating)
        result.refreshed += 1
      }
    } catch (error) {
      // 单条失败不影响其余行；TTL 保持过期，下一轮会重试。
      // 失败原因必须落日志：2026-09-23 排查时日志里只有一个没有原因的
      // failed:3，要靠手工重放才能看出是高德日配额耗尽。
      result.failed += 1
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[amap-rating-refresh] ${row.amapPoiId}: ${message}`)
      if (/DAILY_QUERY_OVER_LIMIT/.test(message)) {
        // 日配额耗尽时剩下的行注定全败：立刻停止本轮，别再空烧请求。
        result.quotaExceeded = true
        console.warn(`[amap-rating-refresh] daily quota exhausted, deferring ${staleRows.length - index - 1} stale rows to the next run`)
        break
      }
    }
    if (delayMs > 0 && index < staleRows.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  return result
}
