import type { ApiPlace } from '~~/shared/types/server'
import { presentStudentSourceContext } from './source-context-presentation'

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

export const nearbyListMessages = {
  emptyMatchTitle: '没有找到相关地点',
  emptyMatchHint: '换个名字或分类试试',
  clearFilters: '清除筛选',
  openMap: '打开周边地图',
  viewPlace: '查看地点',
  needShortcutsTitle: '按要办的事找',
  publishedHeading: '本页整理的周边地点',
  candidatesHeading: '附近这些地方可以先看看',
  matchCountPrefix: '下方找到',
  matchCountSuffix: '个相关地点'
} as const

export const nearbyNeedShortcuts = [
  { label: '吃饭', category: 'food' as const, icon: 'i-lucide-utensils' },
  { label: '取快递', category: 'express' as const, icon: 'i-lucide-package' },
  { label: '日用品', category: 'shopping' as const, icon: 'i-lucide-shopping-basket' },
  { label: '打印维修', category: 'service' as const, icon: 'i-lucide-wrench' }
] as const

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
  food: '营业、菜单、价格常有变化',
  shopping: '库存、营业时间常变',
  service: '服务项目和价格先问店里',
  express: '取件以短信和取件码为准'
}

export const nearbyVerificationChecklist = [
  '出发前确认营业和路线',
  '看评价，不只看评分',
  '取件看短信和取件码',
  '先问价格，证件不乱给'
] as const

export const nearbyUsageTips = [
  { title: '吃饭', text: '营业和路线先看一遍', icon: 'i-lucide-utensils', category: 'food' },
  { title: '取快递', text: '看短信和取件码', icon: 'i-lucide-package-check', category: 'express' },
  { title: '买日用品', text: '急需先打电话问', icon: 'i-lucide-shopping-basket', category: 'shopping' },
  { title: '维修和电信', text: '先问价格和证件', icon: 'i-lucide-wrench', category: 'service' }
] as const

export function isNearbyNeedShortcutActive(
  shortcut: { category: string },
  activeCategory: string
): boolean {
  return activeCategory === shortcut.category
}

export function nearbyMatchCountLabel(count: number): string {
  const value = Math.max(0, Math.round(Number(count) || 0))
  return nearbyListMessages.matchCountPrefix + ' ' + value + ' ' + nearbyListMessages.matchCountSuffix
}

export function nearbySourceIsClickable(source: { status?: string }): boolean {
  return source.status !== 'unavailable' && source.status !== 'disputed'
}

export function nearbySourceContextForStudents(value: string | undefined): string {
  return presentStudentSourceContext(value, { includeUnavailableNote: false })
    ?? '以现场和最新通知为准。'
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

export function nearbyCandidateDistanceLabel(candidate: NearbyCandidate): string {
  return `离${nearbyCandidateCenterLabel(candidate)}参考点约 ${Math.max(0, Math.round(candidate.distanceMeters))} 米`
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
