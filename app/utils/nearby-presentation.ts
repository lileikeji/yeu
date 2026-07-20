import type { ApiPlace } from '~~/shared/types/server'

/** Research-source shape needed by the nearby page fixed references. */
export interface NearbyResearchSourceLike {
  title: string
  url: string
  status?: string
  context?: string
  publisher?: string
  accessedAt?: string
}

/**
 * Select the fixed student-facing research references shown on the nearby page.
 * Pure: callers pass seed/catalog objects so Node tests need no Nuxt aliases.
 */
export function selectNearbyResearchSources<T extends {
  expressMap: NearbyResearchSourceLike
  freshmanSurvival: NearbyResearchSourceLike
  food: NearbyResearchSourceLike
}>(sources: T) {
  return [
    sources.expressMap,
    sources.freshmanSurvival,
    sources.food
  ] as const
}

export type NearbyCandidateCenterId = 'new-student-street' | 'old-student-street'
export type NearbyCandidateCategory = 'food' | 'shopping' | 'service' | 'express'

export interface NearbyCandidate {
  centerId: NearbyCandidateCenterId
  name: string
  category: NearbyCandidateCategory
  amapType: string
  location: { lng: number, lat: number, crs: 'GCJ-02' }
  address: string
  distanceMeters: number
  amapPoiId: string
}

export interface NearbyPlaceLike {
  name: string
  summary: string
  address: string | null
  campusArea: string | null
  category: string | null
  type: string
}

export interface NearbyCandidatePreview<T> {
  items: T[]
  hiddenCount: number
}

export const nearbyCandidatePreviewLimit = 6

export const nearbyCategoryLabels: Record<string, string> = {
  food: '餐饮',
  shopping: '购物 / 便利',
  service: '生活服务',
  express: '快递',
  lodging: '住宿',
  retail: '零售',
  medical: '医疗',
  repair: '打印 / 维修',
  transit: '交通',
  nearby: '生活服务'
}

export const nearbyCategoryHints: Record<NearbyCandidateCategory, string> = {
  food: '营业时间、菜单和价格可能变化，出发前可以先在地图上看一眼。',
  shopping: '日用品库存和营业时间变化较快，具体以到店看到的情况为准。',
  service: '打印、维修、电信和美发的服务项目与价格，请到店或电话询问。',
  express: '取件请以短信里的站点、取件码和现场牌子为准。'
}

export const nearbyVerificationChecklist = [
  '先看地图是否仍显示营业，再确认路线有没有到门口',
  '吃饭和购物先看近期评价，但不要只按评分决定',
  '快递取件以短信里的站点和取件码为准',
  '维修、电信等服务先问价格，需要证件时只交给正规工作人员'
] as const

export const nearbyUsageTips = [
  { title: '吃饭', text: '出发前看看营业时间和路线，到店后以现场为准。', icon: 'i-lucide-utensils', category: 'food' },
  { title: '取快递', text: '实际站点以短信、取件码和现场牌子为准。', icon: 'i-lucide-package-check', category: 'express' },
  { title: '买日用品', text: '开学季库存变化快，急需物品可以先电话询问。', icon: 'i-lucide-shopping-basket', category: 'shopping' },
  { title: '维修和电信', text: '先问清服务项目、价格和是否需要证件。', icon: 'i-lucide-wrench', category: 'service' }
] as const

export function nearbySourceIsClickable(source: { status?: string }): boolean {
  return source.status !== 'unavailable' && source.status !== 'disputed'
}

export function nearbySourceContextForStudents(value: string | undefined): string {
  if (!value?.trim()) return '这条信息可以帮助了解大致情况，具体以现场和最新通知为准。'
  return value
    .replace(/社交平台待核验线索/g, '社交平台参考信息')
    .replace(/社交平台视频线索/g, '社交平台视频参考')
    .replace(/与高德 POI 交叉命中的商铺候选/g, '在高德地图和学生分享中都出现过的商铺')
    .replace(/2025 年社交平台旧线索/g, '2025 年社交平台参考')
    .replace(/候选/g, '参考')
    .replace(/均待复核/g, '都要再确认')
    .replace(/仍待确认/g, '还要再确认')
    .replace(/仍待核验/g, '还要再确认')
    .replace(/待核验/g, '还要再确认')
    .replace(/原外链当前不可稳定访问，前台仅保留为归档线索。?/g, '原链接现在不稳定，先作为参考记录保留。')
    .replace(/归档线索/g, '参考记录')
}

export function nearbyCandidateMapUrl(candidate: NearbyCandidate): string {
  const url = new URL('https://uri.amap.com/marker')
  url.searchParams.set('position', `${candidate.location.lng},${candidate.location.lat}`)
  url.searchParams.set('name', candidate.name)
  url.searchParams.set('coordinate', 'gaode')
  url.searchParams.set('callnative', '0')
  return url.toString()
}

export function nearbyCandidateCenterLabel(candidate: NearbyCandidate): string {
  return candidate.centerId === 'new-student-street' ? '新区学生街' : '旧区学生街'
}

export function nearbyCandidateHint(candidate: NearbyCandidate): string {
  return nearbyCategoryHints[candidate.category]
}

export function nearbyPlaceCategory(place: NearbyPlaceLike): string {
  return place.category ?? place.type
}

export function filterNearbyPlaces<T extends NearbyPlaceLike>(
  places: readonly T[],
  options: { query: string, activeCategory: string }
): T[] {
  const query = options.query.trim().toLocaleLowerCase('zh-CN')
  return places.filter((place) => {
    const category = nearbyPlaceCategory(place)
    const categoryMatches = options.activeCategory === 'all' || category === options.activeCategory
    const queryMatches = !query || [place.name, place.summary, place.address, place.campusArea]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('zh-CN')
      .includes(query)
    return categoryMatches && queryMatches
  })
}

export function filterNearbyCandidates(
  candidates: readonly NearbyCandidate[],
  options: { query: string, activeCategory: string }
): NearbyCandidate[] {
  const query = options.query.trim().toLocaleLowerCase('zh-CN')
  return candidates.filter((candidate) => {
    const categoryMatches = options.activeCategory === 'all' || candidate.category === options.activeCategory
    const queryMatches = !query || [candidate.name, candidate.address, candidate.amapType]
      .join(' ')
      .toLocaleLowerCase('zh-CN')
      .includes(query)
    return categoryMatches && queryMatches
  })
}

export function buildNearbyCandidatePreview<T>(
  candidates: readonly T[],
  options: { expanded: boolean, filterActive: boolean, limit?: number }
): NearbyCandidatePreview<T> {
  const limit = Math.max(1, Math.floor(options.limit ?? nearbyCandidatePreviewLimit))
  if (options.expanded || options.filterActive || candidates.length <= limit) {
    return { items: [...candidates], hiddenCount: 0 }
  }
  return {
    items: candidates.slice(0, limit),
    hiddenCount: candidates.length - limit
  }
}

export function buildNearbyCategoryOptions(
  places: readonly NearbyPlaceLike[],
  candidates: readonly NearbyCandidate[]
): Array<{ value: string, label: string }> {
  return [...new Set([
    ...places.map(place => nearbyPlaceCategory(place)),
    ...candidates.map(candidate => candidate.category)
  ])]
    .map(value => ({ value, label: nearbyCategoryLabels[value] ?? value }))
}

/** Type alias for published API places used by the nearby page. */
export type NearbyPublishedPlace = ApiPlace
