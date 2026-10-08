import { and, desc, eq, gt } from 'drizzle-orm'
import type { ApiPublicPromotedMerchants } from '../../../shared/types/server'
import { placeAmapRatings, placeMerchants, places } from '../../database/schema'
import { useAppDatabase } from '../../utils/database'
import { setPublicCache } from '../../utils/http'

/** 从地点简介提炼一句话口碑（"…是学校周边的快餐小吃店"），去掉与评分徽章重复的尾句。 */
function merchantTagline(summary: string | null): string {
  const text = summary ?? ''
  const tipMatch = text.match(/，是([^。；！?？]{2,36})/u)
  const tip = tipMatch ? `是${tipMatch[1]}` : text.replace(/[。\s]*$/u, '').slice(0, 40)
  return tip.replace(/，高德评分\s*\d+(?:\.\d+)?$/u, '').trim()
}

export default defineEventHandler((event) => {
  // 与其他 public GET 路由一致：先声明不可缓存，成功准备数据后才由
  // setPublicCache 放宽。否则失败/半成品响应可能被边缘节点缓存。
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const now = Date.now()
  const rows = client.db.select({
    slug: places.slug,
    name: places.name,
    type: places.type,
    address: places.address,
    summary: places.summary,
    score: placeAmapRatings.score,
    cost: placeAmapRatings.cost,
    promoWeight: placeMerchants.promoWeight
  }).from(places)
    .innerJoin(placeMerchants, and(
      eq(placeMerchants.placeId, places.id),
      eq(placeMerchants.enabled, true)
    ))
    .leftJoin(placeAmapRatings, and(
      eq(placeAmapRatings.placeId, places.id),
      gt(placeAmapRatings.expiresAt, now)
    ))
    .where(eq(places.status, 'published'))
    .orderBy(desc(placeMerchants.promoWeight))
    .all()

  const items: ApiPublicPromotedMerchants['items'] = rows.map(row => {
    const address = row.address ?? ''
    const area = address.includes('新区')
      ? '新区' as const
      : address.includes('旧区')
        ? '旧区' as const
        : null
    return {
      slug: row.slug,
      name: row.name,
      type: row.type,
      score: row.score,
      cost: row.cost,
      area,
      tagline: merchantTagline(row.summary)
    }
  })
  setPublicCache(event, 30)
  return { items }
})
