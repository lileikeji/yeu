import type { MapArea, MapPoi } from '~~/map/core/types'
import type { MapDisplayOptions, MapLabelSize } from '~~/map/core/provider'
import { toMapPoi, type PublicMapPlace } from './public-catalog'
import { buildDetailFeedbackLink } from './feedback-context'
import { areaMatchesQuery, placeMatchesQuery } from './map-search'

export interface MapCategory {
  id: string
  label: string
  icon: string
}

export const MAP_LOAD_ERROR_MESSAGE = '可以重新试一次，也可以先查看学校平面图或地点清单。'

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
  if (input.activeScope === 'nearby') return '周边生活'
  if (input.publishedCount) return '校园地点'
  if (input.ownerMapCount) return '校园地点'
  if (input.hasPublicPlaceError) return '地点清单'
  return '平面图地点'
}

export function resolveMapFallbackMessage(input: {
  ownerMapCount: number
  areaCount?: number
  hasPublicPlaceError: boolean
  activeScope: string | null | undefined
  publishedCount: number
}): string | null {
  if (input.ownerMapCount) {
    const areaText = input.areaCount ? `和 ${input.areaCount} 个区域` : ''
    return `可以查找 ${input.ownerMapCount} 个地点${areaText}。地图位置适合先认路，到入口处再看现场标识；楼层、开放时间和营业情况可能会调整。`
  }
  if (input.hasPublicPlaceError) {
    return '有些校园地点暂时没显示出来，可以先用现有清单找方向；没有位置的地点仍可在学校平面图中查看。'
  }
  if (input.activeScope === 'nearby' && !input.publishedCount) {
    return '附近地点暂时不多，可以先查看周边生活指南；营业时间和位置请在出发前再确认。'
  }
  if (!input.publishedCount) {
    return '可以按学校平面图上的 47 个地点查找校内建筑；需要导航时请切回地图，到达后再看现场入口。'
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
  if (poi.pointIsVerified) return '可直接导航'
  if (poi.coordinateVerification === 'owner-map-only') return '可先导航到附近 · 入口以现场为准'
  if (poi.coordinateVerification === 'native-map-session') return '地图搜索结果 · 只在本次显示'
  if (poi.coordinateVerification === 'verified' && poi.coordinateSystem) {
    return '已有位置 · 暂时无法在地图显示'
  }
  if (poi.usesPreviewPoint) return `${poi.referenceLabel ?? '平面图编号'} · 可按编号找方向`
  return '暂时没有地图位置'
}

export function buildMapPoiUseChecklist(poi: MapPoiStatusFields): string[] {
  if (poi.usageChecklist.length) return poi.usageChecklist

  if (poi.coordinateVerification === 'native-map-session') {
    return [
      '这是高德地图搜索到的地点，只在当前页面显示。',
      '可以先用来找附近商家；营业状态、价格、电话和入口仍要到店或电话确认。',
      '如果这个地点对新生有帮助，可以通过反馈告诉我们，确认后会加入校园地点。'
    ]
  }

  const checklist = poi.coordinateVerification === 'owner-map-only'
    ? [
        '可以先导航到附近，最后一段请看现场门牌、楼栋名或服务窗口。',
        '入口还可能调整，出发前请再看学校通知或现场标识。',
        '如果地图落点和现场入口有偏差，可以通过纠错入口告诉我们。'
      ]
    : poi.pointIsVerified
      ? [
          '可以直接导航到这个入口；到达后仍请留意现场门牌和临时封路。',
          '开放时间、办理材料和临时管控仍要看对应部门或现场通知。',
          '如果发现入口变更或道路封闭，请提交纠错。'
        ]
      : [
          '这个地点会在学校平面图中标出，方便按编号找方向；这里不能直接导航。',
          '到校后请再看楼名、门牌或现场指引，确认具体入口。',
          '如果你知道准确入口，可以提交位置纠错。'
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
  if (value === null) return '面积还未整理'
  return value >= 10_000
    ? `${(value / 10_000).toFixed(2)} 公顷（${value.toLocaleString('zh-CN')} 平方米）`
    : `${value.toLocaleString('zh-CN')} 平方米`
}

export function formatMapPerimeter(value: number | null): string {
  if (value === null) return '边界长度还未整理'
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
    // Fully hide the list sheet on mobile so the map and floating place card stay usable.
    collapsed: 'h-0 overflow-hidden border-0 shadow-none pointer-events-none',
    // The controls above the list need more than half of a short phone
    // viewport. Give the list a real scroll area so gestures do not fall
    // through to the map canvas.
    half: 'h-[min(58vh,calc(100%_-_0.75rem))]',
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
  return '当前地图暂不支持这个显示选项'
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

export type MapViewMode = 'geographic' | 'official-plan'

export function canShowOfficialCampusPlan(activeScope: string | null | undefined): boolean {
  return activeScope !== 'nearby'
}

export function resolveSelectPoiMobileSheetState(_state: MobileSheetState): MobileSheetState {
  // Selecting a place on mobile should free the map for the floating detail card,
  // instead of expanding the bottom list sheet over the marker popup.
  return 'collapsed'
}

export function resolveSelectPoiMapViewMode(input: {
  usesPreviewPoint: boolean
  canShowOfficialPlan: boolean
  currentMode: MapViewMode
}): MapViewMode {
  // Selecting a place should not replace the active provider with the campus
  // plan. The map/plan switch is an explicit user choice; keeping the current
  // mode is especially important in embedded WeChat and QQ browsers where a
  // sudden plan overlay looks like AMap failed to load.
  void input.usesPreviewPoint
  void input.canShowOfficialPlan
  return input.currentMode
}

export type SelectPoiFlyAction = 'none' | 'fly-to-point' | 'fly-to-poi'

export function resolveSelectPoiFlyAction(
  poi: Pick<PublicMapPlace, 'point' | 'coordinateVerification'>
): SelectPoiFlyAction {
  if (!poi.point) return 'none'
  if (poi.coordinateVerification === 'native-map-session') return 'fly-to-point'
  return 'fly-to-poi'
}

export function resolveSelectPoiNativePlace(poi: PublicMapPlace): PublicMapPlace | null {
  return poi.coordinateVerification === 'native-map-session' ? poi : null
}

export function resolveSelectPoiProviderId(
  poi: Pick<PublicMapPlace, 'id' | 'point'>
): string | null {
  return poi.point ? poi.id : null
}

export interface SelectPoiUiDecision {
  mobileSheetState: MobileSheetState
  mapViewMode: MapViewMode
  selectedNativePlace: PublicMapPlace | null
  providerSelectedPoiId: string | null
  flyAction: SelectPoiFlyAction
}

export function resolveSelectPoiUiDecision(input: {
  poi: PublicMapPlace
  mobileSheetState: MobileSheetState
  mapViewMode: MapViewMode
  canShowOfficialPlan: boolean
}): SelectPoiUiDecision {
  const { poi } = input
  return {
    mobileSheetState: resolveSelectPoiMobileSheetState(input.mobileSheetState),
    mapViewMode: resolveSelectPoiMapViewMode({
      usesPreviewPoint: Boolean(poi.usesPreviewPoint),
      canShowOfficialPlan: input.canShowOfficialPlan,
      currentMode: input.mapViewMode
    }),
    selectedNativePlace: resolveSelectPoiNativePlace(poi),
    providerSelectedPoiId: resolveSelectPoiProviderId(poi),
    flyAction: resolveSelectPoiFlyAction(poi)
  }
}

export function resolveMapPoiClickSelection(input: {
  poi: Pick<MapPoi, 'id' | 'source'> | null
  nativePlaceId: string | null | undefined
}): {
  clearArea: boolean
  selectedPoiId: string | null
  expandSidebarAndScroll: boolean
} {
  const poi = input.poi
  if (!poi) {
    return {
      clearArea: false,
      selectedPoiId: null,
      expandSidebarAndScroll: false
    }
  }

  const isNative = poi.source === 'amap-native'
  const selectedPoiId = isNative ? input.nativePlaceId ?? null : poi.id
  return {
    clearArea: true,
    selectedPoiId,
    expandSidebarAndScroll: Boolean(selectedPoiId && !isNative)
  }
}

export function resolveInitialMapCategoryId(
  initialCategory: string | null | undefined,
  categoryIds: ReadonlySet<string> | Iterable<string>
): string {
  const set = categoryIds instanceof Set ? categoryIds : new Set(categoryIds)
  return initialCategory && set.has(initialCategory) ? initialCategory : 'all'
}

export function resolveInitialSelectedMapPoiId(
  places: readonly Pick<PublicMapPlace, 'id' | 'slug'>[],
  initialPlace: string | null | undefined
): string | null {
  if (!initialPlace) return null
  return places.find(poi => poi.slug === initialPlace || poi.id === initialPlace)?.id ?? null
}

export function buildFilteredMapPois(
  places: readonly PublicMapPlace[]
): MapPoi[] {
  return places.flatMap((place) => {
    const poi = toMapPoi(place)
    return poi ? [poi] : []
  })
}

export function shouldClearSelectedMapPoiOnListChange(input: {
  selectedPoiId: string | null | undefined
  filteredPlaces: readonly Pick<PublicMapPlace, 'id'>[]
  nativeSearchResults: readonly Pick<PublicMapPlace, 'id'>[]
  selectedNativePlaceId: string | null | undefined
}): boolean {
  const id = input.selectedPoiId
  if (!id) return false

  const selectedIsNative = input.nativeSearchResults.some(poi => poi.id === id)
  const selectedIsNativeDetail = input.selectedNativePlaceId === id
  if (selectedIsNative || selectedIsNativeDetail) return false

  return !input.filteredPlaces.some(poi => poi.id === id)
}

export function resolveOfficialPlanHotspotSelectionReset(): {
  searchQuery: ''
  activeCategory: 'all'
  sidebarCollapsed: false
} {
  return {
    searchQuery: '',
    activeCategory: 'all',
    sidebarCollapsed: false
  }
}

export function resolveAreaSelectedDecision(area: MapArea | null): {
  selectedArea: MapArea | null
  providerSelectedAreaId: string | null
  clearSelectedPoi: boolean
} {
  return {
    selectedArea: area,
    providerSelectedAreaId: area?.id ?? null,
    clearSelectedPoi: Boolean(area)
  }
}

export function resolveSelectAreaDecision(area: MapArea): {
  selectedArea: MapArea
  selectedPoiId: null
  selectedNativePlace: null
  providerSelectedPoiId: null
  providerSelectedAreaId: string
} {
  return {
    selectedArea: area,
    selectedPoiId: null,
    selectedNativePlace: null,
    providerSelectedPoiId: null,
    providerSelectedAreaId: area.id
  }
}

export function shouldScrollAfterAutoSelectPoi(
  poi: Pick<PublicMapPlace, 'coordinateVerification'>
): boolean {
  return poi.coordinateVerification !== 'native-map-session'
}

export type AutoSelectSearchApply
  = | { kind: 'clear-key' }
    | { kind: 'noop' }
    | {
      kind: 'select-poi'
      autoKey: string
      target: PublicMapPlace
      expandSidebar: true
      scrollToPoiId: string | null
    }
    | {
      kind: 'select-area'
      autoKey: string
      targetArea: MapArea
      expandSidebar: true
    }

export function resolveAutoSelectSearchApply(
  decision: AutoSelectSearchDecision
): AutoSelectSearchApply {
  if (decision.action === 'clear-key') return { kind: 'clear-key' }
  if (decision.action === 'noop') return { kind: 'noop' }
  if (decision.action === 'select-poi') {
    return {
      kind: 'select-poi',
      autoKey: decision.autoKey,
      target: decision.target,
      expandSidebar: true,
      scrollToPoiId: shouldScrollAfterAutoSelectPoi(decision.target)
        ? decision.target.id
        : null
    }
  }

  return {
    kind: 'select-area',
    autoKey: decision.autoKey,
    targetArea: decision.targetArea,
    expandSidebar: true
  }
}

export function resolveClosePoiDetailsDecision(): {
  selectedPoiId: null
  selectedNativePlace: null
  providerSelectedPoiId: null
} {
  return {
    selectedPoiId: null,
    selectedNativePlace: null,
    providerSelectedPoiId: null
  }
}

export function resolveCloseAreaDetailsDecision(): {
  selectedArea: null
  providerSelectedAreaId: null
} {
  return {
    selectedArea: null,
    providerSelectedAreaId: null
  }
}

export function resolveSetCategoryDecision(categoryId: string): {
  activeCategory: string
  selectedPoiId: null
  selectedNativePlace: null
  providerSelectedPoiId: null
} {
  return {
    activeCategory: categoryId,
    selectedPoiId: null,
    selectedNativePlace: null,
    providerSelectedPoiId: null
  }
}

export function resolveFitToVisiblePoisDecision(): {
  selectedPoiId: null
  selectedNativePlace: null
  selectedArea: null
  providerSelectedPoiId: null
  providerSelectedAreaId: null
  shouldFitToPois: true
} {
  return {
    selectedPoiId: null,
    selectedNativePlace: null,
    selectedArea: null,
    providerSelectedPoiId: null,
    providerSelectedAreaId: null,
    shouldFitToPois: true
  }
}

export function resolveSearchQueryChangeReset(): {
  lastAutoLocatedSearchKey: ''
  selectedNativePlace: null
} {
  return {
    lastAutoLocatedSearchKey: '',
    selectedNativePlace: null
  }
}

export function resolveSelectPoiApplyDecision(input: {
  poi: PublicMapPlace
  mobileSheetState: MobileSheetState
  mapViewMode: MapViewMode
  canShowOfficialPlan: boolean
}): {
  selectedArea: null
  providerSelectedAreaId: null
  selectedPoiId: string
  mobileSheetState: MobileSheetState
  mapViewMode: MapViewMode
  selectedNativePlace: PublicMapPlace | null
  providerSelectedPoiId: string | null
  flyAction: SelectPoiFlyAction
} {
  const ui = resolveSelectPoiUiDecision(input)
  return {
    selectedArea: null,
    providerSelectedAreaId: null,
    selectedPoiId: input.poi.id,
    mobileSheetState: ui.mobileSheetState,
    mapViewMode: ui.mapViewMode,
    selectedNativePlace: ui.selectedNativePlace,
    providerSelectedPoiId: ui.providerSelectedPoiId,
    flyAction: ui.flyAction
  }
}

export function resolveMapPoiClickApply(input: {
  poi: Pick<MapPoi, 'id' | 'source'> | null
  nativePlace: PublicMapPlace | null
}): {
  clearArea: boolean
  selectedPoiId: string | null
  selectedNativePlace: PublicMapPlace | null
  providerSelectedPoiId: string | null
  expandSidebarAndScroll: boolean
  scrollToPoiId: string | null
} {
  const selection = resolveMapPoiClickSelection({
    poi: input.poi,
    nativePlaceId: input.nativePlace?.id
  })
  return {
    clearArea: selection.clearArea,
    selectedPoiId: selection.selectedPoiId,
    selectedNativePlace: input.nativePlace,
    providerSelectedPoiId: selection.selectedPoiId,
    expandSidebarAndScroll: selection.expandSidebarAndScroll,
    scrollToPoiId: selection.expandSidebarAndScroll
      ? selection.selectedPoiId
      : null
  }
}

export function resolveSelectOfficialPlanNumberDecision(
  places: readonly PublicMapPlace[],
  mapNumber: string
): null | {
  poi: PublicMapPlace
  searchQuery: ''
  activeCategory: 'all'
  sidebarCollapsed: false
} {
  const poi = findPublicMapPlaceByOfficialPlanNumber(places, mapNumber)
  if (!poi) return null
  return {
    poi,
    ...resolveOfficialPlanHotspotSelectionReset()
  }
}

export const defaultMapDisplayOptions: MapDisplayOptions = {
  showPois: true,
  showAreas: true,
  showLabels: true,
  autoCluster: true,
  labelSize: 'small'
}

export function canPlanMapWalkingRoute(
  activeMapProviderId: string | null | undefined,
  point: { lng: number, lat: number } | null | undefined
): boolean {
  return activeMapProviderId === 'amap' && Boolean(point)
}

export type MapRouteCameraAction
  = | { kind: 'fly-to-poi', poiId: string }
    | { kind: 'refocus-selected-area', areaId: string }
    | { kind: 'fit-to-pois' }
    | { kind: 'none' }

export function resolveMapRouteApplyDecision(input: {
  scope: string | null | undefined
  selectedPoiId: string | null
  selectedArea: MapArea | null
  places: readonly PublicMapPlace[]
  filteredPlaces: readonly Pick<PublicMapPlace, 'id'>[]
  filtersChanged: boolean
}): {
  forceGeographicView: boolean
  providerSelectedPoiId: string | null
  providerSelectedAreaId: string | null
  cameraAction: MapRouteCameraAction
  scrollToPoiId: string | null
} {
  const nextSelected = input.places.find(poi => poi.id === input.selectedPoiId) ?? null
  const selectionIsVisible = Boolean(
    nextSelected && input.filteredPlaces.some(poi => poi.id === nextSelected.id)
  )
  const providerSelectedPoiId = selectionIsVisible && nextSelected?.point
    ? nextSelected.id
    : null
  const providerSelectedAreaId = input.selectedArea?.id ?? null

  let cameraAction: MapRouteCameraAction
  if (selectionIsVisible && nextSelected?.point) {
    cameraAction = { kind: 'fly-to-poi', poiId: nextSelected.id }
  } else if (input.selectedArea) {
    cameraAction = { kind: 'refocus-selected-area', areaId: input.selectedArea.id }
  } else if (
    input.filtersChanged
    || (!selectionIsVisible && !input.selectedArea)
    || !nextSelected?.point
  ) {
    cameraAction = { kind: 'fit-to-pois' }
  } else {
    cameraAction = { kind: 'none' }
  }

  return {
    forceGeographicView: input.scope === 'nearby',
    providerSelectedPoiId,
    providerSelectedAreaId,
    cameraAction,
    scrollToPoiId: selectionIsVisible && nextSelected ? nextSelected.id : null
  }
}

export type MapViewModeSwitchDecision = {
  mapViewMode: MapViewMode
  mobileSheetState: MobileSheetState | null
  providerSelectedPoiId: string | null
  cameraAction: 'fly-to-point' | 'fly-to-poi' | 'none'
  keepSelection: boolean
}

/** Keep the selected place panel/camera when users toggle 地图 / 平面图. */
export function resolveMapViewModeSwitchDecision(input: {
  nextMode: MapViewMode
  currentMode: MapViewMode
  selectedPoi: Pick<PublicMapPlace, 'id' | 'point' | 'usesPreviewPoint'> | null
  mobileSheetState: MobileSheetState
}): MapViewModeSwitchDecision {
  if (input.nextMode === input.currentMode) {
    return {
      mapViewMode: input.currentMode,
      mobileSheetState: null,
      providerSelectedPoiId: null,
      cameraAction: 'none',
      keepSelection: Boolean(input.selectedPoi)
    }
  }

  const selected = input.selectedPoi
  if (!selected) {
    return {
      mapViewMode: input.nextMode,
      mobileSheetState: null,
      providerSelectedPoiId: null,
      cameraAction: 'none',
      keepSelection: false
    }
  }

  // Free the list sheet so the floating detail card stays visible over either basemap.
  const mobileSheetState: MobileSheetState = 'collapsed'
  if (input.nextMode === 'geographic') {
    const hasPoint = Boolean(selected.point)
    return {
      mapViewMode: 'geographic',
      mobileSheetState,
      providerSelectedPoiId: selected.id,
      cameraAction: hasPoint ? 'fly-to-point' : 'fly-to-poi',
      keepSelection: true
    }
  }

  return {
    mapViewMode: 'official-plan',
    mobileSheetState,
    providerSelectedPoiId: null,
    cameraAction: 'none',
    keepSelection: true
  }
}
