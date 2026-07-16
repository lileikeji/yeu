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
  food: '先当作吃饭参考：到店前还要确认是否营业、是否支持堂食/打包、价格和高峰排队情况。',
  shopping: '先当作生活补给参考：到店前还要确认是否营业、是否有日用品/饮用水/文具等新生常用物品。',
  service: '先当作生活服务参考：维修、打印、电信、美发等服务范围和价格需要到店或电话确认。',
  express: '先当作取件寄件参考：不同快递品牌、取件码、营业时间和寄件范围要看短信、平台和站点现场提示。'
}

export const nearbyVerificationChecklist = [
  '现场招牌或门头名称与平台名称一致',
  '入口位置可以被新生实际找到，不只停留在道路中心点',
  '当学期仍在营业，并确认大致营业时间',
  '服务范围明确：餐饮、便利、维修、电信、快递品牌或寄件范围',
  '如果涉及优惠或推广，必须写清提供方、条件和有效期'
] as const

export const nearbyUsageTips = [
  { title: '吃饭', text: '先看餐饮参考清单，了解学生街大概有哪些店；真正推荐要等菜单、价格和营业状态确认。' },
  { title: '取快递', text: '先看快递参考清单判断可能方向；实际取件以短信、平台取件码和站点现场牌子为准。' },
  { title: '买日用品', text: '便利店、超市参考清单只说明“可能有补给点”；开学季库存和营业时间变化很快。' },
  { title: '维修/电信', text: '手机维修、文印、电信营业厅等服务要确认项目、收费和是否需要身份证件。' }
] as const

export function nearbySourceIsClickable(source: { status?: string }): boolean {
  return source.status !== 'unavailable' && source.status !== 'disputed'
}

export function nearbySourceContextForStudents(value: string | undefined): string {
  if (!value?.trim()) return '来源可作为参考，具体信息以现场和学校最新通知为准。'
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
