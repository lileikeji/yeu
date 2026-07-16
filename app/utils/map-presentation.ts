import type { MapArea, MapPoi } from '~~/map/core/types'
import type { MapDisplayOptions, MapLabelSize } from '~~/map/core/provider'
import type { PublicMapPlace } from './public-catalog'
import { buildDetailFeedbackLink } from './feedback-context'
import { areaMatchesQuery, placeMatchesQuery } from './map-search'

export interface MapCategory {
  id: string
  label: string
  icon: string
}

export type MapPoiStatusFields = Pick<
  PublicMapPlace,
  | 'pointIsVerified'
  | 'coordinateVerification'
  | 'coordinateSystem'
  | 'usesPreviewPoint'
  | 'referenceLabel'
  | 'category'
  | 'usageChecklist'
  | 'name'
  | 'campusArea'
  | 'address'
>

export const mapCategories: MapCategory[] = [
  { id: 'all', label: '全部', icon: 'i-lucide-layout-grid' },
  { id: 'campus-building', label: '教学', icon: 'i-lucide-school' },
  { id: 'dorm', label: '宿舍', icon: 'i-lucide-bed-single' },
  { id: 'food', label: '餐饮', icon: 'i-lucide-utensils' },
  { id: 'service', label: '服务', icon: 'i-lucide-landmark' },
  { id: 'express', label: '快递', icon: 'i-lucide-package' },
  { id: 'gate', label: '校门', icon: 'i-lucide-door-open' },
  { id: 'nearby', label: '周边', icon: 'i-lucide-store' }
]

export const mapCategoryIds = new Set(mapCategories.map(category => category.id))

export function resolveMapCategoryLabel(categoryId: string): string {
  return mapCategories.find(category => category.id === categoryId)?.label ?? '地点'
}

export function resolveMapCategoryIcon(categoryId: string): string {
  return mapCategories.find(category => category.id === categoryId)?.icon ?? 'i-lucide-map-pin'
}

export function resolveMapDataLabel(input: {
  publishedCount: number
  ownerMapCount: number
  hasPublicPlaceError: boolean
  activeScope: string | null | undefined
}): string {
  if (input.publishedCount) return '已发布目录'
  if (input.ownerMapCount) return '高德地图标点'
  if (input.hasPublicPlaceError) return '静态目录'
  if (input.activeScope === 'nearby') return '周边生活'
  return '官网文字编号索引'
}

export function resolveMapFallbackMessage(input: {
  ownerMapCount: number
  hasPublicPlaceError: boolean
  activeScope: string | null | undefined
  publishedCount: number
}): string | null {
  if (input.ownerMapCount) {
    return '当前 76 个标点与 8 个不规则区域边界来自你提供的高德地图数据，已经按原位置放到地图上；区域只画边线，内部商铺仍可点击和搜索。实际入口、楼层和营业状态请现场确认。'
  }
  if (input.hasPublicPlaceError) {
    return '公开地点暂时不可用，当前显示内置文字目录，不绘制临时坐标。'
  }
  if (input.activeScope === 'nearby' && !input.publishedCount) {
    return '暂无完成位置、来源和营业状态确认的周边地点，因此不把商铺写成正式推荐，也不生成近似坐标。'
  }
  if (!input.publishedCount) {
    return '当前可使用学校官网 47 项文字编号查找校内地点；本站不转载原图，也不强行生成导航坐标。'
  }
  return null
}

export function buildMapPoiLocationCopyText(poi: Pick<MapPoiStatusFields, 'name' | 'referenceLabel' | 'campusArea' | 'address'>): string {
  return [
    poi.name,
    poi.referenceLabel,
    poi.campusArea,
    poi.address
  ].filter((value): value is string => Boolean(value)).join(' · ')
}

export function resolveMapPoiStatusText(poi: MapPoiStatusFields): string {
  if (poi.pointIsVerified) return '入口位置已现场核对'
  if (poi.coordinateVerification === 'owner-map-only') return '已按地图标点定位 · 入口细节请现场确认'
  if (poi.coordinateVerification === 'native-map-session') return '高德底图地点 · 临时查看，不加入左侧地点列表'
  if (poi.coordinateVerification === 'verified' && poi.coordinateSystem) {
    return '位置已记录 · 当前底图暂不能显示'
  }
  if (poi.usesPreviewPoint) return `${poi.referenceLabel ?? '官网文字编号索引'} · 不绘制标点`
  return '地点已发布 · 坐标暂不显示'
}

export function buildMapPoiUseChecklist(poi: MapPoiStatusFields): string[] {
  if (poi.usageChecklist.length) return poi.usageChecklist

  if (poi.coordinateVerification === 'native-map-session') {
    return [
      '这是高德当前视野返回的临时地点，刷新后不会保存到学校目录。',
      '可以先用来定位附近商家；营业状态、价格、电话和入口仍要到店或电话确认。',
      '如果这个地点对新生有用，可以通过反馈入口提交来源，管理员确认后再进入正式目录。'
    ]
  }

  const checklist = poi.coordinateVerification === 'owner-map-only'
    ? [
        '这个点来自你提供的高德地图标点，可以先导航到附近。',
        '到达后请看现场门牌、楼栋名或服务窗口，确认是不是你要去的入口。',
        '它还不是学校现场双重核验坐标，不要把它当成唯一行动依据。'
      ]
    : poi.pointIsVerified
      ? [
          '这个地点已经完成入口位置确认，可以作为站内导航参考。',
          '开放时间、办理材料和临时管控仍要看对应部门或现场通知。',
          '如果发现入口变更或道路封闭，请提交纠错。'
        ]
      : [
          '这个地点可作为文字索引使用，暂时不要按它生成精确导航。',
          '先核对官网文字索引、部门说明或现场标识。',
          '发现准确入口后可提交现场采点或纠错。'
        ]

  if (poi.category === 'express') {
    checklist.push('取快递以短信、平台取件码和站点现场牌子为准；不同品牌可能不在同一窗口。')
  }
  if (poi.category === 'nearby') {
    checklist.push('周边商铺到店前再确认是否营业、价格、服务范围和是否有开学季临时变化。')
  }
  if (poi.category === 'food') {
    checklist.push('餐饮点高峰期可能排队或临时调整营业；外卖能否送达以平台和校门现场规则为准。')
  }
  if (poi.category === 'dorm') {
    checklist.push('找宿舍时先确认楼栋名称，再看入口、门禁和辅导员/宿管现场安排。')
  }
  return checklist
}

export function formatMapAreaSquareMeters(value: number | null): string {
  if (value === null) return '暂无数据'
  return value >= 10_000
    ? `${(value / 10_000).toFixed(2)} 公顷（${value.toLocaleString('zh-CN')} 平方米）`
    : `${value.toLocaleString('zh-CN')} 平方米`
}

export function formatMapPerimeter(value: number | null): string {
  if (value === null) return '暂无数据'
  return value >= 1000 ? `${(value / 1000).toFixed(2)} 公里` : `${value.toLocaleString('zh-CN')} 米`
}

export function buildMapPlaceDetailsTarget(
  poi: Pick<PublicMapPlace, 'isApiPublished' | 'slug'>,
  fromPath: string
): { path: string, query: { from: string } } | undefined {
  if (!poi.isApiPublished || !poi.slug) return undefined
  return {
    path: `/places/${poi.slug}`,
    query: { from: fromPath }
  }
}

export function buildMapPlaceFeedbackTarget(
  poi: Pick<PublicMapPlace, 'isApiPublished' | 'id' | 'name'>,
  fromPath: string
) {
  if (!poi.isApiPublished) return undefined
  return buildDetailFeedbackLink({
    targetType: 'place',
    targetId: poi.id,
    targetName: poi.name,
    reasonType: 'place_error',
    from: fromPath
  })
}

export function resolveOfficialPlanNumber(
  poi: Pick<PublicMapPlace, 'officialPlanNumber'> | null | undefined
): string | null {
  return poi?.officialPlanNumber ?? null
}

export type MobileSheetState = 'collapsed' | 'half' | 'expanded'

export function resolveMobileSheetHeightClass(state: MobileSheetState): string {
  return ({
    collapsed: 'h-20',
    half: 'h-[44%]',
    expanded: 'h-[calc(100%_-_0.75rem)]'
  } as const)[state]
}

export function filterPublicMapPlacesByScope<T extends Pick<PublicMapPlace, 'scope'>>(
  places: readonly T[],
  activeScope: string | null | undefined
): T[] {
  return places.filter(place => !activeScope || place.scope === activeScope)
}

export function filterOwnerMapPlacesInScope<T extends Pick<PublicMapPlace, 'scope' | 'coordinateVerification'>>(
  places: readonly T[],
  activeScope: string | null | undefined
): T[] {
  return places.filter(place => (
    place.coordinateVerification === 'owner-map-only'
    && (!activeScope || place.scope === activeScope)
  ))
}

export function filterPublicMapPlacesForMapList(
  places: readonly PublicMapPlace[],
  input: {
    query: string
    activeScope: string | null | undefined
    activeCategory: string
  }
): PublicMapPlace[] {
  const query = input.query.trim()
  const hasQuery = Boolean(query)

  return places.filter((poi) => {
    const matchesScope = !input.activeScope || poi.scope === input.activeScope
    const matchesCategory = hasQuery || input.activeCategory === 'all' || poi.category === input.activeCategory
    const matchesQuery = placeMatchesQuery(poi, query)
    return matchesScope && matchesCategory && matchesQuery
  })
}

export function filterMapAreasForMapSearch(
  areas: readonly MapArea[],
  input: {
    query: string
    activeScope: string | null | undefined
  }
): MapArea[] {
  const query = input.query.trim()
  if (!query || input.activeScope === 'nearby') return []
  return areas.filter(area => areaMatchesQuery(area, query))
}

export function resolveInitialMapViewMode(input: {
  activeScope: string | null | undefined
  publishedCount: number
  ownerMapCount: number
}): 'geographic' | 'official-plan' {
  if (input.activeScope === 'nearby' || input.publishedCount || input.ownerMapCount) {
    return 'geographic'
  }
  return 'official-plan'
}

export type MapDisplayToggleKey = Exclude<keyof MapDisplayOptions, 'labelSize'>

export function toggleMapDisplayOption(
  options: MapDisplayOptions,
  option: MapDisplayToggleKey
): MapDisplayOptions {
  return {
    ...options,
    [option]: !options[option]
  }
}

export function withMapLabelSize(
  options: MapDisplayOptions,
  labelSize: MapLabelSize
): MapDisplayOptions {
  return { ...options, labelSize }
}

export function resolveMapUnsupportedBaseStyleMessage(): string {
  return '当前地图不支持该图层'
}

export function filterMapAreasForProviderScope(
  areas: readonly MapArea[],
  activeScope: string | null | undefined
): MapArea[] {
  return activeScope === 'nearby' ? [] : [...areas]
}

export function resolveSelectedMapPoiId(
  filteredMapPois: readonly Pick<MapPoi, 'id'>[],
  selectedPoiId: string | null | undefined
): string | null {
  return filteredMapPois.find(poi => poi.id === selectedPoiId)?.id ?? null
}

export function resolveSelectedPublicMapPlace(input: {
  places: readonly PublicMapPlace[]
  selectedNativePlace: PublicMapPlace | null | undefined
  nativeSearchResults: readonly PublicMapPlace[]
  selectedPoiId: string | null | undefined
}): PublicMapPlace | null {
  const id = input.selectedPoiId
  if (!id) return null

  const fromPlaces = input.places.find(poi => poi.id === id)
  if (fromPlaces) return fromPlaces

  if (input.selectedNativePlace?.id === id) {
    return input.selectedNativePlace
  }

  return input.nativeSearchResults.find(poi => poi.id === id) ?? null
}

export function findPublicMapPlaceByOfficialPlanNumber(
  places: readonly PublicMapPlace[],
  mapNumber: string
): PublicMapPlace | undefined {
  return places.find(place => place.officialPlanNumber === mapNumber)
}

export type AutoSelectSearchDecision
  = | { action: 'clear-key' }
    | { action: 'noop' }
    | { action: 'select-poi', autoKey: string, target: PublicMapPlace }
    | { action: 'select-area', autoKey: string, targetArea: MapArea }

export function resolveAutoSelectSearchDecision(input: {
  query: string
  activeCategory: string
  lastAutoLocatedSearchKey: string
  visiblePois: readonly PublicMapPlace[]
  visibleAreas: readonly MapArea[]
  selectedAreaId: string | null | undefined
  selectedPoiId: string | null | undefined
  nativeSearchResults: readonly PublicMapPlace[]
}): AutoSelectSearchDecision {
  const query = input.query.trim()
  if (!query) return { action: 'clear-key' }

  const currentArea = input.visibleAreas.find(area => area.id === input.selectedAreaId)
  const currentPoi = input.visiblePois.find(poi => poi.id === input.selectedPoiId)
    ?? input.nativeSearchResults.find(poi => poi.id === input.selectedPoiId)
  const target = currentArea
    ? null
    : currentPoi
      ?? input.visiblePois.find(poi => poi.point)
      ?? (input.visiblePois.length && input.nativeSearchResults.length === 0 ? input.visiblePois[0] : null)
      ?? input.nativeSearchResults.find(poi => poi.point)
      ?? input.visiblePois[0]
      ?? null
  const targetArea = currentArea ?? input.visibleAreas[0] ?? null
  if (!target && !targetArea) return { action: 'noop' }

  const autoKey = `${query}|${input.activeCategory}|${target?.id ?? ''}|${targetArea?.id ?? ''}`
  if (input.lastAutoLocatedSearchKey === autoKey) return { action: 'noop' }

  if (target) {
    return { action: 'select-poi', autoKey, target }
  }

  return { action: 'select-area', autoKey, targetArea: targetArea as MapArea }
}
