import { nearbyGuideQuerySchema } from '../../../../../shared/schemas/server'
import type { ApiNearbyGuide, ApiNearbyGuideResponse } from '../../../../../shared/types/server'
import { nearbyGuideCategoryLabels, nearbyGuideItems } from '../../../../../data/nearby-guide'
import { setPublicCache } from '../../../../utils/http'
import { parseQuery } from '../../../../utils/validation'

function categoryLabel(category: string): string {
  return nearbyGuideCategoryLabels[category as keyof typeof nearbyGuideCategoryLabels] ?? category
}

/**
 * 周边攻略复用网页端的整理结果（data/nearby-guide.ts），只做学生向裁剪。
 * 目的地坐标来自高德 POI，本来就是 GCJ-02，这里如实标注，避免下游再换算一次。
 */
function presentNearbyGuide(item: (typeof nearbyGuideItems)[number]): ApiNearbyGuide {
  return {
    id: item.id,
    scope: item.scope,
    category: item.category,
    categoryLabel: categoryLabel(item.category),
    eyebrow: item.eyebrow,
    title: item.title,
    summary: item.summary,
    highlights: item.highlights,
    suitableFor: item.suitableFor,
    travelNote: item.travelNote,
    costNote: item.costNote,
    freshnessNote: item.freshnessNote,
    coordinateSystem: 'GCJ-02',
    destinations: item.destinations.map(destination => ({
      id: destination.id,
      label: destination.label,
      longitude: destination.longitude,
      latitude: destination.latitude,
      note: destination.note ?? null
    }))
  }
}

export default defineEventHandler((event): ApiNearbyGuideResponse => {
  const query = parseQuery(event, nearbyGuideQuerySchema)

  // 分类胶囊按 scope 统计，才能和「切换到市区后还剩哪些分类」对得上。
  const scoped = query.scope
    ? nearbyGuideItems.filter(item => item.scope === query.scope)
    : nearbyGuideItems
  const items = query.category
    ? scoped.filter(item => item.category === query.category)
    : scoped

  const counts = new Map<string, number>()
  for (const item of scoped) counts.set(item.category, (counts.get(item.category) ?? 0) + 1)

  setPublicCache(event, 300)
  return {
    items: items.map(presentNearbyGuide),
    total: items.length,
    categories: [...counts.entries()].map(([id, count]) => ({ id, label: categoryLabel(id), count }))
  }
})
