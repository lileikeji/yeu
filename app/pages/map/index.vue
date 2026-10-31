<script setup lang="ts">
import type { MapArea, MapPoi } from '~~/map/core/types'
import type {
  MapBaseStyle,
  MapDisplayOptions,
  MapLabelSize,
  MapProvider,
  MapProviderId
} from '~~/map/core/provider'
import { officialSources } from '~~/data/seeds/public-content'
import { safeExternalHref } from '~/utils/safe-external-href'
import { campusMapReferencePlaces } from '~~/data/seeds/preview-places'
import { amapImportedPlaces } from '~~/data/seeds/amap-imported-places'
import { amapImportedAreas } from '~~/data/seeds/amap-imported-areas'
import type { PublicMapPlace } from '~/utils/public-catalog'
import { mergeAmapImportedPlacesWithDrafts, mergePublicMapPlaces } from '~/utils/public-catalog'
import { createNativeMapPlace } from '~/utils/map-native-search'
import { mapQueryValue, mapRouteScope } from '~/utils/map-route-state'
import {
  buildMapPlaceDetailsTarget,
  buildMapPlaceFeedbackTarget,
  buildMapPoiLocationCopyText,
  buildMapPoiUseChecklist,
  filterMapAreasForMapSearch,
  filterMapAreasForProviderScope,
  filterOwnerMapPlacesInScope,
  filterPublicMapPlacesByScope,
  filterPublicMapPlacesForMapList,
  formatMapAreaSquareMeters,
  formatMapPerimeter,
  mapCategories,
  mapCategoryIds,
  MAP_LOAD_ERROR_MESSAGE,
  buildFilteredMapPois,
  canPlanMapWalkingRoute,
  defaultMapDisplayOptions,
  canShowOfficialCampusPlan,
  resolveMapViewModeSwitchDecision,
  resolveAutoSelectSearchDecision,
  resolveAutoSelectSearchApply,
  resolveSelectAreaDecision,
  resolveAreaSelectedDecision,
  resolveClosePoiDetailsDecision,
  resolveCloseAreaDetailsDecision,
  resolveSetCategoryDecision,
  resolveFitToVisiblePoisDecision,
  resolveSearchQueryChangeReset,
  resolveInitialMapCategoryId,
  resolveInitialMapViewMode,
  resolveInitialSelectedMapPoiId,
  resolveSelectPoiApplyDecision,
  resolveMapPoiClickApply,
  resolveSelectOfficialPlanNumberDecision,
  shouldClearSelectedMapPoiOnListChange,
  resolveMapCategoryIcon,
  resolveMapCategoryLabel,
  resolveMapDataLabel,
  resolveMapFallbackMessage,
  resolveMapPoiStatusText,
  resolveMapUnsupportedBaseStyleMessage,
  resolveMobileSheetAnchors,
  resolveMobileSheetHeightClass,
  resolveMobileSheetStateFromHeight,
  resolveOfficialPlanNumber,
  resolveSelectedMapPoiId,
  resolveSelectedPublicMapPlace,
  toggleMapDisplayOption,
  withMapLabelSize,
  type MapDisplayToggleKey,
  type MobileSheetState
} from '~~/app/utils/map-presentation'
import { safeLocalPath } from '~/utils/safe-navigation'

useSeoMeta({
  title: '校园地图',
  description: '查找教学楼、宿舍、食堂、服务点与校园周边地点。',
  robots: 'noindex, nofollow'
})

const route = useRoute()
const mapHeaderTitle = useState<string>('map-header-title', () => '')
// Temporarily keep the official floor-plan data available without exposing a
// public entry point. Re-enable this switch when the plan is ready to return.
const OFFICIAL_PLAN_ENTRY_VISIBLE = false
const categories = mapCategories
const categoryIds = mapCategoryIds
const initialCategory = mapQueryValue(route.query.category)
const initialPlace = mapQueryValue(route.query.place)
const { data: publicPlaceResponse, error: publicPlaceError } = await usePublicPlaceList()
const { data: amapOwnerDraftResponse } = await usePublicAmapOwnerDraftPlaces()
const geoCipherKey = __GEO_CIPHER_KEY__
const ownerMapSeeds = computed(() => mergeAmapImportedPlacesWithDrafts(
  amapImportedPlaces,
  amapOwnerDraftResponse.value?.items,
  geoCipherKey
))
const catalogPlaces = computed(() => mergePublicMapPlaces(
  campusMapReferencePlaces,
  publicPlaceResponse.value?.items ?? [],
  ownerMapSeeds.value,
  geoCipherKey
))
const places = computed(() => catalogPlaces.value)
const activeScope = computed(() => mapRouteScope(route.query))
const publishedPlacesInScope = computed(() => filterPublicMapPlacesByScope(
  publicPlaceResponse.value?.items ?? [],
  activeScope.value
))
const ownerMapPlacesInScope = computed(() => filterOwnerMapPlacesInScope(
  places.value,
  activeScope.value
))
const initialSelectedPoiId = resolveInitialSelectedMapPoiId(places.value, initialPlace)
const canShowOfficialPlan = computed(() => OFFICIAL_PLAN_ENTRY_VISIBLE
  && canShowOfficialCampusPlan(activeScope.value))
const mapViewMode = ref<'geographic' | 'official-plan'>(
  canShowOfficialPlan.value
    ? resolveInitialMapViewMode({
        activeScope: activeScope.value,
        publishedCount: publishedPlacesInScope.value.length,
        ownerMapCount: ownerMapPlacesInScope.value.length
      })
    : 'geographic'
)
const mobileSheetState = ref<MobileSheetState>(initialSelectedPoiId ? 'collapsed' : 'half')
const mobileSheetElement = ref<HTMLElement | null>(null)
const mobileSheetDragHeight = ref<number | null>(null)
const mobileSheetDragPointerId = ref<number | null>(null)
const mobileSheetDragStartY = ref(0)
const mobileSheetDragStartHeight = ref(0)
const mobileSheetDragging = ref(false)
const sidebarCollapsed = ref(false)
const displaySettingsOpen = ref(false)

function toggleDisplaySettings(): void {
  displaySettingsOpen.value = !displaySettingsOpen.value
  if (displaySettingsOpen.value) mobileSheetState.value = 'collapsed'
}
const mapBaseStyle = ref<MapBaseStyle>('standard')
const mapDisplayOptions = ref<MapDisplayOptions>({ ...defaultMapDisplayOptions })
const mobileSheetHeightClass = computed(() => resolveMobileSheetHeightClass(mobileSheetState.value))
const mobileSheetStyle = computed(() => mobileSheetDragHeight.value === null
  ? undefined
  : {
      height: `${mobileSheetDragHeight.value}px`,
      transition: 'none'
    })
const mapDataLabel = computed(() => resolveMapDataLabel({
  publishedCount: publishedPlacesInScope.value.length,
  ownerMapCount: ownerMapPlacesInScope.value.length,
  hasPublicPlaceError: Boolean(publicPlaceError.value),
  activeScope: activeScope.value
}))
const mapFallbackMessage = computed(() => resolveMapFallbackMessage({
  ownerMapCount: ownerMapPlacesInScope.value.length,
  areaCount: filterMapAreasForProviderScope(amapImportedAreas, activeScope.value).length,
  hasPublicPlaceError: Boolean(publicPlaceError.value),
  activeScope: activeScope.value,
  publishedCount: publishedPlacesInScope.value.length
}))

const mapElement = ref<HTMLElement | null>(null)
const mapProvider = shallowRef<MapProvider | null>(null)
const activeMapProviderId = ref<MapProviderId | null>(null)
const mapStatus = ref<'loading' | 'ready' | 'error'>('loading')
const mapErrorMessage = ref(MAP_LOAD_ERROR_MESSAGE)
// 仅当 query 来自分享/直达链接时，首次列表就绪后自动定位一次；
// 手动输入只更新列表，由用户点选后再定位。
const deepLinkSearchQuery = mapQueryValue(route.query.q)
const deepLinkAutoSelectFired = ref(false)
const searchQuery = ref(deepLinkSearchQuery)
// 中文输入法（拼音/手写）组词期间 value 是中间拼音，不能触发搜索/筛选。
// 组词结束（compositionend）后按最终值提交一次。
const searchIsComposing = ref(false)

function commitSearchQuery(value: string): void {
  searchIsComposing.value = false
  searchQuery.value = value
}

function onSearchQueryInput(value: string): void {
  if (searchIsComposing.value) return
  searchQuery.value = value
}

function onSearchCompositionStart(): void {
  searchIsComposing.value = true
}

function onSearchCompositionEnd(event: CompositionEvent): void {
  const target = event.target as HTMLInputElement | null
  commitSearchQuery(target?.value ?? searchQuery.value)
}

function clearSearchQuery(): void {
  commitSearchQuery('')
}
const activeCategory = ref(resolveInitialMapCategoryId(initialCategory, categoryIds))
const selectedPoiId = ref<string | null>(initialSelectedPoiId)
const selectedArea = ref<MapArea | null>(null)
const selectedAreaId = computed(() => selectedArea.value?.id ?? null)
const selectedNativePlace = ref<PublicMapPlace | null>(null)
const toast = useToast()
const manualStartPick = ref<{ destinationName: string, destination: MapPoi['point'] } | null>(null)
const manualStartOpen = computed({
  get: () => manualStartPick.value !== null,
  set: (open: boolean) => {
    if (!open) manualStartPick.value = null
  }
})
const routeStepsOpen = ref(false)
/** 手动起点锚点：校门与公交/交通站是最自然的“出发点”。 */
const startAnchors = computed(() => {
  const categories = new Set(['gate', 'transit-stop'])
  return places.value.filter(poi => categories.has(poi.category)).slice(0, 8)
})
const {
  locating,
  routePlanning,
  routeSummary,
  routeSteps,
  routeDestinationName,
  routeSummaryText,
  tracking,
  following,
  remainingSummary,
  locateUser,
  startWalkingRoute,
  startWalkingRouteFrom,
  clearWalkingRoute,
  toggleTracking,
  toggleFollowing
} = useMapGeolocation({
  mapProvider,
  activeMapProviderId,
  notify: notice => toast.add(notice),
  onWalkingRouteLocationFailed: (destinationName, destination) => {
    if (!destination) return
    manualStartPick.value = { destinationName, destination }
  }
})

function openManualStartPicker(): void {
  const place = selectedPoi.value
  if (!place?.point) return
  manualStartPick.value = { destinationName: place.name, destination: place.point }
}

function planFromAnchor(anchorName: string, anchorPoint: MapPoi['point'] | null): void {
  if (!anchorPoint) return
  const pick = manualStartPick.value
  if (!pick) return
  manualStartPick.value = null
  routeStepsOpen.value = false
  startWalkingRouteFrom(anchorName, anchorPoint, pick.destinationName, pick.destination)
}
const {
  nativeSearchResults,
  nativeSearchLoading,
  queueNativeSearch,
  cancelNativeSearch
} = useMapNativeSearch({
  mapProvider,
  mapViewMode,
  activeScope,
  searchQuery,
  catalogPlaces,
  onResultsReady: maybeAutoSelectDeepLink
})
const { copyText, isWechat } = useShareActions()
const poiRowElements = new Map<string, HTMLElement>()
let lastAutoLocatedSearchKey = ''

const filteredPois = computed(() => filterPublicMapPlacesForMapList(places.value, {
  query: searchQuery.value,
  activeScope: activeScope.value,
  activeCategory: activeCategory.value
}))

const filteredMapPois = computed<MapPoi[]>(() => buildFilteredMapPois(filteredPois.value))
const filteredAreas = computed(() => filterMapAreasForMapSearch(amapImportedAreas, {
  query: searchQuery.value,
  activeScope: activeScope.value
}))
const providerAreas = computed(() => filterMapAreasForProviderScope(amapImportedAreas, activeScope.value))
const selectedMapPoiId = computed(() => resolveSelectedMapPoiId(filteredMapPois.value, selectedPoiId.value))

const selectedPoi = computed(() => resolveSelectedPublicMapPlace({
  places: places.value,
  selectedNativePlace: selectedNativePlace.value,
  nativeSearchResults: nativeSearchResults.value,
  selectedPoiId: selectedPoiId.value
}))
watch([selectedPoi, selectedArea], ([poi, area]) => {
  mapHeaderTitle.value = poi?.name ?? area?.name ?? ''
}, { immediate: true })
const returnPath = computed(() => safeLocalPath(route.query.from))

function placeDetailsTarget(poi: PublicMapPlace) {
  return buildMapPlaceDetailsTarget(poi, returnPath.value ?? route.fullPath)
}

function placeFeedbackTarget(poi: PublicMapPlace) {
  return buildMapPlaceFeedbackTarget(poi, route.fullPath)
}

function copyPoiLocation(poi: PublicMapPlace): void {
  void copyText(buildMapPoiLocationCopyText(poi), '地点信息')
}

function categoryLabel(categoryId: string) {
  return resolveMapCategoryLabel(categoryId)
}

function categoryIcon(categoryId: string) {
  return resolveMapCategoryIcon(categoryId)
}

function poiStatusText(poi: PublicMapPlace) {
  return resolveMapPoiStatusText(poi)
}

function poiUseChecklist(poi: PublicMapPlace): string[] {
  return buildMapPoiUseChecklist(poi)
}

function handlePoiSelected(poi: MapPoi | null) {
  const selected = poi?.source === 'amap-native'
    ? createNativeMapPlace(poi, activeScope.value)
    : null
  const decision = resolveMapPoiClickApply({
    poi,
    nativePlace: selected
  })
  if (decision.clearArea) {
    selectedArea.value = null
    mapProvider.value?.setSelectedArea(null)
  }
  selectedNativePlace.value = decision.selectedNativePlace
  selectedPoiId.value = decision.selectedPoiId
  mapProvider.value?.setSelectedPoi(decision.providerSelectedPoiId)
  // On mobile, free the bottom list sheet so the floating place card can show over the map.
  if (decision.selectedPoiId) {
    mobileSheetState.value = 'collapsed'
  }

  if (decision.expandSidebarAndScroll && decision.scrollToPoiId) {
    sidebarCollapsed.value = false
    void nextTick(() => poiRowElements.get(decision.scrollToPoiId!)?.scrollIntoView({ block: 'nearest' }))
  }
}

function handleAreaSelected(area: MapArea | null): void {
  const decision = resolveAreaSelectedDecision(area)
  selectedArea.value = decision.selectedArea
  mapProvider.value?.setSelectedArea(decision.providerSelectedAreaId)
  if (decision.clearSelectedPoi) {
    selectedPoiId.value = null
    mapProvider.value?.setSelectedPoi(null)
  }
}

function selectArea(area: MapArea): void {
  const decision = resolveSelectAreaDecision(area)
  selectedPoiId.value = decision.selectedPoiId
  selectedNativePlace.value = decision.selectedNativePlace
  selectedArea.value = decision.selectedArea
  mapProvider.value?.setSelectedPoi(decision.providerSelectedPoiId)
  mapProvider.value?.setSelectedArea(decision.providerSelectedAreaId)
}

function toggleDisplayOption(option: MapDisplayToggleKey): void {
  mapDisplayOptions.value = toggleMapDisplayOption(mapDisplayOptions.value, option)
}

function setLabelSize(size: MapLabelSize): void {
  mapDisplayOptions.value = withMapLabelSize(mapDisplayOptions.value, size)
}

function setMapBaseStyle(style: MapBaseStyle): void {
  if (!mapProvider.value?.setBaseStyle(style)) {
    toast.add({ title: resolveMapUnsupportedBaseStyleMessage(), color: 'warning' })
    return
  }
  mapBaseStyle.value = style
}

function formatAreaSquareMeters(value: number | null): string {
  return formatMapAreaSquareMeters(value)
}

function formatPerimeter(value: number | null): string {
  return formatMapPerimeter(value)
}

function setPoiRowElement(id: string, element: unknown) {
  if (element instanceof HTMLElement) {
    poiRowElements.set(id, element)
    return
  }

  poiRowElements.delete(id)
}

function poiRowRef(id: string) {
  return (element: unknown) => setPoiRowElement(id, element)
}

function selectPoi(poi: PublicMapPlace) {
  const decision = resolveSelectPoiApplyDecision({
    poi,
    mobileSheetState: mobileSheetState.value,
    mapViewMode: mapViewMode.value,
    canShowOfficialPlan: canShowOfficialPlan.value
  })
  selectedArea.value = decision.selectedArea
  mapProvider.value?.setSelectedArea(decision.providerSelectedAreaId)
  selectedNativePlace.value = decision.selectedNativePlace
  selectedPoiId.value = decision.selectedPoiId
  mobileSheetState.value = decision.mobileSheetState
  mapViewMode.value = decision.mapViewMode
  mapProvider.value?.setSelectedPoi(decision.providerSelectedPoiId)
  // Opening the desktop details panel changes the settled map layout even
  // though the sidebar remains in the same grid column. AMap can keep the
  // previous viewport after the immediate camera move, leaving a blank strip
  // on wide screens. Resize before and after the camera update.
  if (decision.mapViewMode === 'geographic') {
    mapProvider.value?.resize()
  }
  if (decision.flyAction === 'fly-to-point' && poi.point) {
    mapProvider.value?.flyToPoint(poi.point, 18)
  } else if (decision.flyAction === 'fly-to-poi') {
    mapProvider.value?.flyToPoi(poi.id)
  }
  if (decision.mapViewMode === 'geographic' && typeof window !== 'undefined') {
    void nextTick(() => {
      mapProvider.value?.resize()
      window.requestAnimationFrame(() => mapProvider.value?.resize())
    })
  }
}

function setMapViewMode(nextMode: 'geographic' | 'official-plan') {
  if (nextMode === 'official-plan' && !canShowOfficialPlan.value) return

  const decision = resolveMapViewModeSwitchDecision({
    nextMode,
    currentMode: mapViewMode.value,
    selectedPoi: selectedPoi.value,
    mobileSheetState: mobileSheetState.value
  })
  mapViewMode.value = decision.mapViewMode
  if (decision.mobileSheetState) {
    mobileSheetState.value = decision.mobileSheetState
  }
  if (decision.keepSelection && selectedPoi.value) {
    // Keep the floating place panel open; re-sync geographic selection when returning to map.
    if (decision.mapViewMode === 'geographic') {
      mapProvider.value?.setSelectedPoi(decision.providerSelectedPoiId ?? selectedPoi.value.id)
      if (decision.cameraAction === 'fly-to-point' && selectedPoi.value.point) {
        mapProvider.value?.flyToPoint(selectedPoi.value.point, 18)
      } else if (decision.cameraAction === 'fly-to-poi') {
        mapProvider.value?.flyToPoi(selectedPoi.value.id)
      }
    }
  }
}

function maybeAutoSelectDeepLink(): void {
  if (!deepLinkSearchQuery || deepLinkAutoSelectFired.value) return
  deepLinkAutoSelectFired.value = true
  autoSelectSearchResult()
}

function autoSelectSearchResult(): void {
  const decision = resolveAutoSelectSearchDecision({
    query: searchQuery.value,
    activeCategory: activeCategory.value,
    lastAutoLocatedSearchKey,
    visiblePois: filteredPois.value,
    visibleAreas: filteredAreas.value,
    selectedAreaId: selectedAreaId.value,
    selectedPoiId: selectedPoiId.value,
    nativeSearchResults: nativeSearchResults.value
  })
  const apply = resolveAutoSelectSearchApply(decision)

  if (apply.kind === 'clear-key') {
    lastAutoLocatedSearchKey = ''
    return
  }
  if (apply.kind === 'noop') return

  lastAutoLocatedSearchKey = apply.autoKey
  if (apply.expandSidebar) sidebarCollapsed.value = false
  if (apply.kind === 'select-poi') {
    selectPoi(apply.target)
    if (apply.scrollToPoiId) {
      const scrollToPoiId = apply.scrollToPoiId
      void nextTick(() => poiRowElements.get(scrollToPoiId)?.scrollIntoView({ block: 'nearest' }))
    }
    return
  }

  selectArea(apply.targetArea)
}
function selectedOfficialPlanNumber(poi: PublicMapPlace | null): string | null {
  return resolveOfficialPlanNumber(poi)
}

function selectOfficialPlanNumber(mapNumber: string): void {
  const decision = resolveSelectOfficialPlanNumberDecision(places.value, mapNumber)
  if (!decision) return
  searchQuery.value = decision.searchQuery
  activeCategory.value = decision.activeCategory
  sidebarCollapsed.value = decision.sidebarCollapsed
  selectPoi(decision.poi)
}

function closePoiDetails() {
  const decision = resolveClosePoiDetailsDecision()
  selectedPoiId.value = decision.selectedPoiId
  selectedNativePlace.value = decision.selectedNativePlace
  mapProvider.value?.setSelectedPoi(decision.providerSelectedPoiId)
}

function closeAreaDetails(): void {
  const decision = resolveCloseAreaDetailsDecision()
  selectedArea.value = decision.selectedArea
  mapProvider.value?.setSelectedArea(decision.providerSelectedAreaId)
}

function mobileSheetAnchors() {
  const sheet = mobileSheetElement.value
  const containerHeight = sheet?.parentElement?.getBoundingClientRect().height ?? 0
  const viewportHeight = typeof window === 'undefined' ? containerHeight : window.innerHeight
  return resolveMobileSheetAnchors(containerHeight, viewportHeight)
}

function finishMobileSheetDrag(pointerId?: number): void {
  const sheet = mobileSheetElement.value
  if (pointerId !== undefined && sheet?.hasPointerCapture(pointerId)) {
    sheet.releasePointerCapture(pointerId)
  }

  if (!mobileSheetDragging.value) return
  const anchors = mobileSheetAnchors()
  const nextState = resolveMobileSheetStateFromHeight(mobileSheetDragHeight.value ?? mobileSheetDragStartHeight.value, anchors)
  mobileSheetDragging.value = false
  mobileSheetDragPointerId.value = null
  mobileSheetDragHeight.value = null
  mobileSheetState.value = nextState
}

function handleMobileSheetPointerDown(event: PointerEvent): void {
  if (!event.isPrimary || mobileSheetState.value === 'collapsed' || mobileSheetDragging.value) return
  const target = event.target
  const explicitDragHandle = target instanceof HTMLElement
    ? target.closest('[data-sheet-drag-handle]')
    : null
  if (
    !explicitDragHandle
    && target instanceof HTMLElement
    && target.closest('button, a, input, textarea, select')
  ) return
  const sheet = mobileSheetElement.value
  if (!sheet) return

  mobileSheetDragPointerId.value = event.pointerId
  mobileSheetDragStartY.value = event.clientY
  mobileSheetDragStartHeight.value = sheet.getBoundingClientRect().height
  mobileSheetDragging.value = true
  mobileSheetDragHeight.value = mobileSheetDragStartHeight.value
  event.preventDefault()
  sheet.setPointerCapture(event.pointerId)
}

function handleMobileSheetPointerMove(event: PointerEvent): void {
  if (!mobileSheetDragging.value || mobileSheetDragPointerId.value !== event.pointerId) return
  const anchors = mobileSheetAnchors()
  const maxHeight = anchors.expanded
  const height = mobileSheetDragStartHeight.value + (mobileSheetDragStartY.value - event.clientY)
  mobileSheetDragHeight.value = Math.min(maxHeight, Math.max(0, height))
  event.preventDefault()
}

function setCategory(categoryId: string) {
  const decision = resolveSetCategoryDecision(categoryId)
  activeCategory.value = decision.activeCategory
  selectedPoiId.value = decision.selectedPoiId
  selectedNativePlace.value = decision.selectedNativePlace
  mapProvider.value?.setSelectedPoi(decision.providerSelectedPoiId)
}

function fitToVisiblePois() {
  const decision = resolveFitToVisiblePoisDecision()
  selectedPoiId.value = decision.selectedPoiId
  selectedNativePlace.value = decision.selectedNativePlace
  selectedArea.value = decision.selectedArea
  mapProvider.value?.setSelectedPoi(decision.providerSelectedPoiId)
  mapProvider.value?.setSelectedArea(decision.providerSelectedAreaId)
  if (decision.shouldFitToPois) {
    mapProvider.value?.fitToPois()
  }
}

watch(searchQuery, () => {
  const reset = resolveSearchQueryChangeReset({ mobileSheetState: mobileSheetState.value })
  lastAutoLocatedSearchKey = reset.lastAutoLocatedSearchKey
  selectedNativePlace.value = reset.selectedNativePlace
  if (reset.mobileSheetState) mobileSheetState.value = reset.mobileSheetState
  queueNativeSearch()
})
watch(mapViewMode, queueNativeSearch)
const mapLayoutSignal = computed(() => [
  sidebarCollapsed.value ? 'sidebar-collapsed' : 'sidebar-open',
  mobileSheetState.value,
  mapViewMode.value
].join(':'))
const { mountMap } = useMapProviderLifecycle({
  mapElement,
  mapProvider,
  activeMapProviderId,
  mapStatus,
  mapErrorMessage,
  displayOptions: mapDisplayOptions,
  baseStyle: mapBaseStyle,
  areas: providerAreas,
  pois: filteredMapPois,
  selectedPoiId: selectedMapPoiId,
  selectedAreaId,
  resizeSignal: mapLayoutSignal,
  onPoiSelected: handlePoiSelected,
  onAreaSelected: handleAreaSelected,
  beforeMount: clearWalkingRoute,
  onReady: () => {
    queueNativeSearch()
    // 分享/直达链接带 ?q= 时：地图就绪后再自动定位一次
    maybeAutoSelectDeepLink()
  }
})

watch(filteredPois, (pois) => {
  if (shouldClearSelectedMapPoiOnListChange({
    selectedPoiId: selectedPoiId.value,
    filteredPlaces: pois,
    nativeSearchResults: nativeSearchResults.value,
    selectedNativePlaceId: selectedNativePlace.value?.id
  })) {
    closePoiDetails()
  }
}, { immediate: true })

const { cancelMapRouteSync } = useMapRouteSync({
  categoryIds,
  places,
  areas: amapImportedAreas,
  filteredPois,
  mapProvider,
  mapViewMode,
  searchQuery,
  activeCategory,
  selectedPoiId,
  selectedArea,
  selectedAreaId,
  scrollToPoi: id => poiRowElements.get(id)?.scrollIntoView({ block: 'nearest' })
})

// 校车图层：路线 + 起终点 + 实时车位置（云一卡通 5s 轮询）；快照数据喂掌上公交面板
const { routes: busRoutes, buses: busVehicles, fetchedAt: busFetchedAt } = useMapBusPositions({ mapProvider })
const busPanelOpen = ref(true)

onBeforeUnmount(() => {
  mapHeaderTitle.value = ''
  cancelMapRouteSync()
  cancelNativeSearch()
  clearWalkingRoute()
})
</script>

<template>
  <div
    class="map-workspace relative h-full min-h-0 overflow-hidden bg-white dark:bg-zinc-900 overscroll-none md:grid md:grid-rows-1"
    :class="sidebarCollapsed ? 'md:grid-cols-1' : 'md:grid-cols-[18rem_minmax(0,1fr)]'"
  >
    <aside
      ref="mobileSheetElement"
      class="absolute inset-x-0 bottom-0 z-30 flex min-h-0 min-w-0 flex-col rounded-t-md bg-white dark:bg-zinc-900 transition-[height] duration-200 md:pointer-events-auto md:static md:order-1 md:h-auto md:rounded-none md:border-r md:border-t-0 md:shadow-none"
      :style="mobileSheetStyle"
      :class="[
        mobileSheetHeightClass,
        mobileSheetState === 'collapsed'
          ? 'border-0 shadow-none'
          : 'border-t border-[var(--line)] shadow-[0_-6px_24px_rgb(0_0_0/12%)]',
        // Keep the sheet itself out of the scroll chain. The place list below
        // is the only scroll region on mobile.
        'overflow-hidden',
        mobileSheetDragging ? 'select-none' : '',
        sidebarCollapsed ? 'md:hidden' : ''
      ]"
      @pointermove="handleMobileSheetPointerMove"
      @pointerup="finishMobileSheetDrag($event.pointerId)"
      @pointercancel="finishMobileSheetDrag($event.pointerId)"
      @lostpointercapture="finishMobileSheetDrag()"
    >
      <div
        data-sheet-drag-zone
        class="relative flex h-14 shrink-0 touch-none cursor-ns-resize items-center justify-between gap-2 border-b border-[var(--line)] px-3 md:hidden"
        @pointerdown="handleMobileSheetPointerDown"
      >
        <button
          type="button"
          data-sheet-drag-handle
          class="absolute left-1/2 top-1 flex h-5 w-16 -translate-x-1/2 touch-none items-center justify-center rounded-md text-zinc-400 dark:text-zinc-500 active:bg-zinc-100 dark:active:bg-zinc-800 active:text-zinc-700 dark:active:text-zinc-200"
          aria-label="上下拖动地点面板"
          @pointerdown="handleMobileSheetPointerDown"
        >
          <span
            aria-hidden="true"
            class="block h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700"
          />
        </button>
        <div class="min-w-0 pt-3">
          <p class="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            地点列表 · {{ filteredPois.length }}
          </p>
        </div>
        <div
          class="flex shrink-0 items-center gap-1"
          role="group"
          aria-label="地图面板高度"
        >
          <UTooltip text="全隐藏地点面板">
            <UButton
              icon="i-lucide-chevrons-down"
              color="neutral"
              variant="ghost"
              size="xs"
              class="size-9"
              aria-label="全隐藏地点面板"
              :aria-pressed="mobileSheetState === 'collapsed'"
              @click="() => { mobileSheetState = 'collapsed' }"
            />
          </UTooltip>
          <UTooltip text="半屏显示地点面板">
            <UButton
              icon="i-lucide-minus"
              color="neutral"
              variant="ghost"
              size="xs"
              class="size-9"
              aria-label="半屏显示地点面板"
              :aria-pressed="mobileSheetState === 'half'"
              @click="() => { mobileSheetState = 'half' }"
            />
          </UTooltip>
          <UTooltip text="展开地点面板">
            <UButton
              icon="i-lucide-chevrons-up"
              color="neutral"
              variant="ghost"
              size="xs"
              class="size-9"
              aria-label="展开地点面板"
              :aria-pressed="mobileSheetState === 'expanded'"
              @click="() => { mobileSheetState = 'expanded' }"
            />
          </UTooltip>
        </div>
      </div>

      <div
        class="shrink-0 border-b border-[var(--line)] px-3 py-2 md:block md:px-5 md:py-4"
        :class="mobileSheetState === 'collapsed' ? 'hidden' : 'block'"
      >
        <div class="hidden items-start justify-between gap-3 md:flex">
          <div class="min-w-0">
            <p class="text-xs font-semibold text-green-700 dark:text-green-400">
              校园地图
            </p>
            <h1 class="mt-1 text-lg font-bold text-zinc-950 dark:text-zinc-100">
              校园与周边
            </h1>
          </div>
          <div class="flex items-center gap-1">
            <UBadge
              color="warning"
              variant="soft"
              size="sm"
            >
              {{ mapDataLabel }}
            </UBadge>
            <UTooltip text="收起地点栏">
              <UButton
                icon="i-lucide-panel-left-close"
                color="neutral"
                variant="ghost"
                size="xs"
                class="hidden size-11 md:inline-flex"
                aria-label="收起地点栏"
                @click="() => { sidebarCollapsed = true }"
              />
            </UTooltip>
          </div>
        </div>

        <UInput
          :model-value="searchQuery"
          size="md"
          class="min-h-10 w-full md:mt-3 md:min-h-11"
          :ui="{ base: 'min-h-10 md:min-h-11' }"
          icon="i-lucide-search"
          placeholder="搜索地点或附近商家"
          aria-label="搜索地图地点"
          @update:model-value="onSearchQueryInput"
          @compositionstart="onSearchCompositionStart"
          @compositionend="onSearchCompositionEnd"
        >
          <template
            v-if="searchQuery"
            #trailing
          >
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              aria-label="清空搜索"
              @click="clearSearchQuery"
            />
          </template>
        </UInput>

        <div
          class="mt-2 grid grid-cols-4 gap-1 md:mt-3 md:flex md:overflow-x-auto md:pb-1"
          aria-label="地点分类"
        >
          <UButton
            v-for="category in categories"
            :key="category.id"
            :icon="category.icon"
            :label="category.label"
            :color="activeCategory === category.id ? 'primary' : 'neutral'"
            :variant="activeCategory === category.id ? 'soft' : 'ghost'"
            size="xs"
            class="min-h-9 min-w-0 justify-center px-1 text-[11px] md:min-h-11 md:shrink-0 md:px-2.5 md:text-xs"
            :aria-pressed="activeCategory === category.id"
            @click="setCategory(category.id)"
          />
        </div>

        <p
          v-if="mapFallbackMessage"
          class="mt-2 text-xs leading-5 text-blue-800"
          role="status"
        >
          {{ mapFallbackMessage }}
        </p>
        <p
          v-if="nativeSearchLoading"
          class="mt-2 text-xs text-zinc-500 dark:text-zinc-400"
          role="status"
        >
          正在搜索地图里的地点…
        </p>
        <ul
          v-else-if="searchQuery.trim() && nativeSearchResults.length"
          class="mt-2 max-h-48 space-y-0.5 overflow-y-auto"
          role="status"
          aria-label="地图搜索找到的附近地点，点击查看"
        >
          <li
            v-for="place in nativeSearchResults"
            :key="place.id"
          >
            <button
              type="button"
              class="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs leading-5 text-zinc-600 dark:text-zinc-300 transition-colors hover:bg-green-50 dark:hover:bg-green-950/60 hover:text-green-800 dark:hover:text-green-200"
              @click="selectPoi(place)"
            >
              <UIcon
                name="i-lucide-map-pin"
                class="size-3.5 shrink-0 text-green-700 dark:text-green-400"
              />
              <span class="min-w-0 truncate">{{ place.name }}</span>
            </button>
          </li>
        </ul>
      </div>

      <div
        class="items-center justify-between border-b border-[var(--line)] px-3 py-1 text-xs text-zinc-500 dark:text-zinc-400 md:flex md:px-5 md:py-2"
        :class="mobileSheetState === 'collapsed' ? 'hidden md:flex' : 'flex'"
      >
        <span>{{ filteredPois.length }} 个地点</span>
        <button
          class="min-h-9 min-w-11 px-2 font-medium text-green-700 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 md:min-h-11"
          type="button"
          @click="fitToVisiblePois"
        >
          查看全部
        </button>
      </div>

      <div
        class="map-place-list min-h-0 flex-1 overflow-y-auto overscroll-y-contain md:block"
        :class="mobileSheetState === 'collapsed' ? 'hidden md:block' : 'block'"
        aria-label="地点列表"
        @wheel.stop
        @touchmove.stop
      >
        <button
          v-for="poi in filteredPois"
          :key="poi.id"
          :ref="poiRowRef(poi.id)"
          type="button"
          class="flex w-full items-center gap-2.5 border-b border-zinc-100 dark:border-zinc-800 px-3 py-2 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-green-700 md:gap-3 md:px-5 md:py-3"
          :class="selectedPoiId === poi.id ? 'bg-green-50 dark:bg-green-950' : 'bg-white dark:bg-zinc-900'"
          @click="selectPoi(poi)"
        >
          <span
            class="grid size-8 shrink-0 place-items-center rounded-md md:size-9"
            :class="selectedPoiId === poi.id ? 'bg-green-700 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'"
          >
            <UIcon
              :name="categoryIcon(poi.category)"
              class="size-4"
            />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ poi.name }}</span>
            <span class="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{{ categoryLabel(poi.category) }} · {{ poiStatusText(poi) }}</span>
          </span>
          <UIcon
            name="i-lucide-chevron-right"
            class="size-4 shrink-0 text-zinc-400 dark:text-zinc-500"
          />
        </button>

        <div
          v-if="filteredPois.length === 0"
          class="grid min-h-32 place-items-center p-6 text-center"
        >
          <div>
            <UIcon
              name="i-lucide-map-pin-off"
              class="mx-auto size-6 text-zinc-400 dark:text-zinc-500"
            />
            <p class="mt-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">
              没有匹配的地点
            </p>
          </div>
        </div>
      </div>
    </aside>

    <section
      class="absolute inset-0 isolate min-h-0 min-w-0 overflow-hidden bg-[#e5ebe7] dark:bg-[#1c231e] md:relative md:inset-auto md:order-2"
      aria-label="校园地图"
    >
      <div
        v-show="mapViewMode === 'geographic'"
        class="absolute inset-0"
      >
        <div
          ref="mapElement"
          class="h-full w-full"
        />
      </div>

      <MapOfficialCampusPlan
        v-if="canShowOfficialPlan && mapViewMode === 'official-plan'"
        :selected-map-number="selectedOfficialPlanNumber(selectedPoi)"
        :selected-reference-label="selectedPoi?.referenceLabel"
        :selected-place-name="selectedPoi?.name"
        @select-number="selectOfficialPlanNumber"
      />

      <div class="pointer-events-none absolute inset-x-3 top-3 z-20 flex items-start justify-between gap-3 md:inset-x-4 md:top-4">
        <div class="map-provider-badges flex flex-col items-start gap-1.5">
          <UTooltip
            v-if="sidebarCollapsed"
            text="展开地点栏"
          >
            <UButton
              icon="i-lucide-panel-left-open"
              color="neutral"
              variant="solid"
              class="pointer-events-auto hidden size-11 md:inline-flex"
              aria-label="展开地点栏"
              @click="() => { sidebarCollapsed = false }"
            />
          </UTooltip>
          <UBadge
            color="neutral"
            variant="solid"
            class="pointer-events-auto shadow-sm"
          >
            <UIcon
              :name="mapViewMode === 'official-plan'
                ? 'i-lucide-image'
                : activeMapProviderId === 'amap'
                  ? 'i-lucide-map'
                  : 'i-lucide-flask-conical'"
              class="mr-1 size-3.5"
            />
            {{ mapViewMode === 'official-plan'
              ? '学校平面图'
              : activeMapProviderId === 'amap'
                ? '高德地图'
                : '校园范围参考' }}
          </UBadge>
          <UTooltip
            v-if="mapViewMode === 'geographic' && activeMapProviderId !== 'amap'"
            text="绿色虚线来自公开社区地图资料，只表示校园范围参考，不代表楼栋位置已经确认。"
          >
            <UBadge
              color="success"
              variant="solid"
              class="pointer-events-auto shadow-sm"
            >
              <UIcon
                name="i-lucide-pentagon"
                class="mr-1 size-3.5"
              />
              校园范围参考
            </UBadge>
          </UTooltip>
        </div>
        <div
          v-if="canShowOfficialPlan"
          class="pointer-events-auto absolute left-1/2 top-0 flex -translate-x-1/2 overflow-hidden rounded-md border border-white/40 bg-white dark:bg-zinc-900 shadow-sm"
          role="group"
          aria-label="地图显示模式"
        >
          <UButton
            icon="i-lucide-map"
            label="地图"
            size="sm"
            :color="mapViewMode === 'geographic' ? 'primary' : 'neutral'"
            :variant="mapViewMode === 'geographic' ? 'solid' : 'ghost'"
            :class="['min-h-11 rounded-none px-3', mapViewMode === 'geographic' ? '!bg-green-800 !text-white' : '']"
            :aria-pressed="mapViewMode === 'geographic'"
            @click="setMapViewMode('geographic')"
          />
          <UButton
            icon="i-lucide-image"
            label="平面图"
            size="sm"
            :color="mapViewMode === 'official-plan' ? 'primary' : 'neutral'"
            :variant="mapViewMode === 'official-plan' ? 'solid' : 'ghost'"
            :class="['min-h-11 rounded-none px-3', mapViewMode === 'official-plan' ? '!bg-green-800 !text-white' : '']"
            :aria-pressed="mapViewMode === 'official-plan'"
            @click="setMapViewMode('official-plan')"
          />
        </div>
        <div
          v-if="mapViewMode === 'geographic'"
          class="pointer-events-auto flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden rounded-xl border border-zinc-200/90 bg-white/95 dark:bg-zinc-900/95 shadow-lg backdrop-blur"
        >
          <UTooltip text="地图显示设置">
            <UButton
              icon="i-lucide-layers-3"
              color="neutral"
              variant="ghost"
              class="map-control-btn size-10 rounded-none md:size-11"
              :class="displaySettingsOpen ? 'bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-300' : ''"
              aria-label="地图显示设置"
              :aria-expanded="displaySettingsOpen"
              @click="toggleDisplaySettings"
            />
          </UTooltip>
          <UTooltip text="显示全部地点">
            <UButton
              icon="i-lucide-scan"
              color="neutral"
              variant="ghost"
              class="map-control-btn size-10 rounded-none md:size-11"
              aria-label="显示全部地点"
              @click="fitToVisiblePois"
            />
          </UTooltip>
          <UTooltip :text="tracking ? '停止实时定位' : '定位到我的位置并开启实时跟踪'">
            <UButton
              :icon="tracking ? 'i-lucide-locate-fixed' : 'i-lucide-locate'"
              color="neutral"
              variant="ghost"
              :loading="locating"
              class="map-control-btn size-10 rounded-none md:size-11"
              :class="tracking ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300' : ''"
              aria-label="定位到我的位置并开启实时跟踪"
              :aria-pressed="tracking"
              @click="tracking ? toggleTracking() : locateUser()"
            />
          </UTooltip>
          <UTooltip :text="following ? '暂停相机跟随' : '相机跟随我的位置'">
            <UButton
              icon="i-lucide-crosshair"
              color="neutral"
              variant="ghost"
              :disabled="!tracking"
              class="map-control-btn size-10 rounded-none md:size-11"
              :class="following ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300' : ''"
              aria-label="相机跟随我的位置"
              :aria-pressed="following"
              @click="toggleFollowing"
            />
          </UTooltip>
        </div>
      </div>

      <!-- Mobile: reopen fully-hidden place list -->
      <div
        v-if="mobileSheetState === 'collapsed'"
        class="pointer-events-none absolute inset-x-3 bottom-3 z-30 flex justify-start px-0 md:hidden"
        :class="selectedPoi ? 'bottom-[calc(min(56dvh,30rem)+0.75rem)]' : ''"
      >
        <UButton
          icon="i-lucide-list"
          label="地点列表"
          color="neutral"
          variant="outline"
          class="map-float-btn pointer-events-auto shadow-lg"
          aria-label="打开地点列表"
          @click="() => { mobileSheetState = 'half' }"
        />
      </div>

      <PublicPageViewStats variant="map-dock" />

      <MapDisplaySettingsPanel
        v-if="mapViewMode === 'geographic' && displaySettingsOpen"
        :base-style="mapBaseStyle"
        :display-options="mapDisplayOptions"
        @close="displaySettingsOpen = false"
        @set-base-style="setMapBaseStyle"
        @toggle-option="toggleDisplayOption"
        @set-label-size="setLabelSize"
      />

      <div
        v-if="mapViewMode === 'geographic' && routeSummary"
        class="absolute left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-md border border-green-200 dark:border-green-800 bg-white/95 dark:bg-zinc-900/95 px-4 py-3 shadow-lg backdrop-blur-sm md:bottom-14"
        :class="selectedPoi
          ? 'bottom-[calc(var(--mobile-nav-height)+min(56dvh,30rem)+1rem)]'
          : 'bottom-[calc(var(--mobile-nav-height)+5.5rem)]'"
        role="status"
      >
        <UIcon
          name="i-lucide-route"
          class="size-5 shrink-0 text-green-700 dark:text-green-400"
        />
        <button
          type="button"
          class="flex min-w-0 items-center gap-2 whitespace-nowrap text-left"
          :aria-expanded="routeStepsOpen"
          :aria-label="routeSteps.length ? '展开路口级步行指引' : undefined"
          @click="routeStepsOpen = !routeStepsOpen"
        >
          <span class="min-w-0">
            <span class="block max-w-48 truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              步行至 {{ routeDestinationName }}
            </span>
            <span class="mt-0.5 block text-xs text-zinc-600 dark:text-zinc-300">
              <template v-if="tracking && remainingSummary">
                距目的地 {{ routeSummaryText(remainingSummary) }}
                <span class="text-zinc-400 dark:text-zinc-500">（实时）</span>
              </template>
              <template v-else>
                {{ routeSummaryText(routeSummary) }}
              </template>
            </span>
          </span>
          <UIcon
            v-if="routeSteps.length"
            name="i-lucide-chevron-up"
            class="size-4 shrink-0 text-zinc-400 transition-transform dark:text-zinc-500"
            :class="routeStepsOpen ? '' : 'rotate-180'"
          />
        </button>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="清除步行路线"
          @click="clearWalkingRoute"
        />
      </div>

      <!-- 手动选起点（定位被拒/不可用时的降级） -->
      <UModal
        v-model:open="manualStartOpen"
        title="选择出发地点"
        description="浏览器定位不可用或被拒绝时，选一个出发点来规划步行路线。"
        :ui="{ content: 'w-[calc(100vw-1rem)] sm:max-w-md' }"
      >
        <template #body>
          <ul class="space-y-1">
            <li
              v-for="anchor in startAnchors"
              :key="anchor.id"
            >
              <button
                type="button"
                class="flex min-h-11 w-full items-center gap-2.5 rounded-md border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-left transition hover:border-green-300 dark:hover:border-green-700 hover:bg-green-50 dark:hover:bg-green-950/60"
                @click="planFromAnchor(anchor.name, anchor.point)"
              >
                <UIcon
                  :name="categoryIcon(anchor.category)"
                  class="size-4 shrink-0 text-green-700 dark:text-green-400"
                />
                <span class="min-w-0">
                  <span class="block truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ anchor.name }}</span>
                  <span class="block text-[11px] text-zinc-500 dark:text-zinc-400">设为起点，步行至 {{ manualStartPick?.destinationName }}</span>
                </span>
                <UIcon
                  name="i-lucide-chevron-right"
                  class="ml-auto size-4 shrink-0 text-zinc-400 dark:text-zinc-500"
                />
              </button>
            </li>
          </ul>
          <p class="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            提示：在浏览器设置里允许本站使用定位后，也可以直接点「规划步行路线」自动从你所在位置规划。
          </p>
        </template>
      </UModal>

      <!-- 路口级步行指引（点路线条展开） -->
      <div
        v-if="mapViewMode === 'geographic' && routeSummary && routeStepsOpen && routeSteps.length"
        class="absolute left-1/2 z-20 w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden rounded-md border border-green-200 dark:border-green-800 bg-white/95 dark:bg-zinc-900/95 shadow-lg backdrop-blur-sm md:bottom-14"
        :class="selectedPoi
          ? 'bottom-[calc(var(--mobile-nav-height)+min(56dvh,30rem)+3.5rem)]'
          : 'bottom-[calc(var(--mobile-nav-height)+8rem)]'"
        role="list"
        aria-label="步行指引分段"
      >
        <ol class="max-h-52 overflow-y-auto">
          <li
            v-for="(step, index) in routeSteps"
            :key="index"
            class="flex items-start gap-2 border-b border-zinc-100 dark:border-zinc-800 px-3 py-2 text-xs leading-5 last:border-b-0"
          >
            <UIcon
              name="i-lucide-corner-down-right"
              class="mt-0.5 size-3.5 shrink-0 text-green-700 dark:text-green-400"
            />
            <span class="min-w-0 flex-1 text-zinc-700 dark:text-zinc-200">{{ step.instruction }}</span>
            <span class="shrink-0 text-zinc-400 dark:text-zinc-500">{{ step.distanceMeters >= 1000 ? (step.distanceMeters / 1000).toFixed(1) + ' 公里' : Math.round(step.distanceMeters) + ' 米' }}</span>
          </li>
        </ol>
      </div>

      <div
        v-if="mapViewMode === 'geographic' && mapStatus !== 'ready'"
        class="absolute inset-0 z-10 grid place-items-start p-4 pt-32 text-center md:place-items-center md:p-6"
        :class="mapStatus === 'loading' ? 'pointer-events-auto bg-[#e5ebe7] dark:bg-[#1c231e]/95' : 'pointer-events-none'"
        :role="mapStatus === 'loading' ? 'status' : 'alert'"
      >
        <div v-if="mapStatus === 'loading'">
          <UIcon
            name="i-lucide-loader-circle"
            class="mx-auto size-7 animate-spin text-green-700 dark:text-green-400"
          />
          <p class="mt-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            正在载入地图
          </p>
        </div>
        <div
          v-else
          class="pointer-events-auto max-w-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 p-5 shadow-lg backdrop-blur-sm"
        >
          <UIcon
            name="i-lucide-map-pin-off"
            class="mx-auto size-8 text-zinc-500 dark:text-zinc-400"
          />
          <p class="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            地图画面暂时没有显示出来
          </p>
          <p class="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            {{ mapErrorMessage }}
          </p>
          <div class="mt-4 flex flex-wrap justify-center gap-2">
            <UButton
              icon="i-lucide-refresh-cw"
              label="重新试一次"
              color="neutral"
              variant="outline"
              size="sm"
              class="min-h-11"
              @click="mountMap"
            />
            <UButton
              v-if="canShowOfficialPlan"
              icon="i-lucide-map"
              label="查看学校平面图"
              color="neutral"
              variant="ghost"
              size="sm"
              class="min-h-11"
              @click="setMapViewMode('official-plan')"
            />
          </div>
        </div>
      </div>

      <div
        v-else-if="mapViewMode === 'geographic' && filteredMapPois.length === 0"
        class="pointer-events-none absolute inset-x-4 top-32 z-10 flex justify-center md:top-20"
        role="status"
      >
        <div class="max-w-sm border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 px-4 py-3 text-center shadow-sm backdrop-blur-sm">
          <UIcon
            name="i-lucide-map-pin-off"
            class="mx-auto size-5 text-zinc-500 dark:text-zinc-400"
          />
          <p class="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            当前地图还没有可直接显示的地点
          </p>
          <p class="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            {{ activeMapProviderId === 'amap'
              ? '左侧目录仍可搜索；部分地图地点可以直接显示，平面图中的文字地点不会被强行放到错误的位置。'
              : '绿色虚线只表示校园的大致范围。左侧目录仍可搜索；没有确认位置的地点不会硬塞到地图上。' }}
          </p>
          <UButton
            v-if="canShowOfficialPlan"
            :to="safeExternalHref(officialSources.campusMap.url) || undefined"
            target="_blank"
            rel="noopener noreferrer"
            icon="i-lucide-external-link"
            label="查看学校平面图"
            color="neutral"
            variant="outline"
            size="sm"
            class="pointer-events-auto mt-3"
          />
        </div>
      </div>

      <section
        v-if="selectedArea"
        class="absolute left-3 z-30 w-[min(22rem,calc(100%-1.5rem))] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-xl md:bottom-12 md:left-4"
        :class="mobileSheetState === 'collapsed' || selectedPoi
          ? 'bottom-[calc(var(--mobile-nav-height)+0.75rem)] md:bottom-12'
          : 'bottom-[calc(44%+1rem)] md:bottom-12'"
        aria-live="polite"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="flex items-center gap-2 text-xs font-medium text-green-700 dark:text-green-400">
              <UIcon
                name="i-lucide-pentagon"
                class="size-4"
              />
              地图范围
            </div>
            <h2 class="mt-1 text-base font-bold text-zinc-950 dark:text-zinc-100">
              {{ selectedArea.name }}
            </h2>
          </div>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="关闭区域详情"
            @click="closeAreaDetails"
          />
        </div>
        <p class="mt-3 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
          {{ selectedArea.description ?? '这个范围来自地图绘制，只用来帮助你辨认校园方向。' }}
        </p>
        <dl class="mt-3 grid grid-cols-2 gap-3 border-t border-zinc-100 dark:border-zinc-800 pt-3 text-xs">
          <div>
            <dt class="text-zinc-400 dark:text-zinc-500">
              面积
            </dt>
            <dd class="mt-1 font-medium text-zinc-800 dark:text-zinc-100">
              {{ formatAreaSquareMeters(selectedArea.areaSquareMeters) }}
            </dd>
          </div>
          <div>
            <dt class="text-zinc-400 dark:text-zinc-500">
              周长
            </dt>
            <dd class="mt-1 font-medium text-zinc-800 dark:text-zinc-100">
              {{ formatPerimeter(selectedArea.perimeterMeters) }}
            </dd>
          </div>
        </dl>
        <p class="mt-3 text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">
          这里只显示范围边界，不会挡住里面的商铺点击。
        </p>
      </section>

      <MapPlaceDetailsPanel
        v-if="selectedPoi"
        variant="mobile"
        :place="selectedPoi"
        :category-label="categoryLabel(selectedPoi.category)"
        :category-icon="categoryIcon(selectedPoi.category)"
        :status-text="poiStatusText(selectedPoi)"
        :checklist="poiUseChecklist(selectedPoi)"
        :details-target="placeDetailsTarget(selectedPoi)"
        :feedback-target="placeFeedbackTarget(selectedPoi)"
        :return-path="returnPath"
        :route-planning="routePlanning"
        :can-plan-route="canPlanMapWalkingRoute(activeMapProviderId, selectedPoi.point)"
        :is-wechat="isWechat"
        @close="closePoiDetails"
        @copy="copyPoiLocation(selectedPoi)"
        @plan-route="startWalkingRoute(selectedPoi.name, selectedPoi.point)"
        @plan-route-manual="openManualStartPicker"
      />

      <MapPlaceDetailsPanel
        v-if="selectedPoi"
        variant="desktop"
        :place="selectedPoi"
        :category-label="categoryLabel(selectedPoi.category)"
        :category-icon="categoryIcon(selectedPoi.category)"
        :status-text="poiStatusText(selectedPoi)"
        :checklist="poiUseChecklist(selectedPoi)"
        :details-target="placeDetailsTarget(selectedPoi)"
        :feedback-target="placeFeedbackTarget(selectedPoi)"
        :return-path="returnPath"
        :route-planning="routePlanning"
        :can-plan-route="canPlanMapWalkingRoute(activeMapProviderId, selectedPoi.point)"
        :is-wechat="isWechat"
        @close="closePoiDetails"
        @copy="copyPoiLocation(selectedPoi)"
        @plan-route="startWalkingRoute(selectedPoi.name, selectedPoi.point)"
        @plan-route-manual="openManualStartPicker"
      />
    </section>

    <!-- 掌上公交式校车面板：线路总览 + 车辆进度 + 预计距离 -->
    <MapBusRoutePanel
      v-model:open="busPanelOpen"
      :routes="busRoutes"
      :buses="busVehicles"
      :fetched-at="busFetchedAt"
    />
  </div>
</template>

<style>
.map-workspace {
  height: 100%;
  min-height: 0;
  overscroll-behavior: none;
  contain: layout paint;
}

.map-workspace .maplibregl-map {
  position: absolute;
  inset: 0;
}

.map-workspace .maplibregl-ctrl-bottom-left,
.map-workspace .maplibregl-ctrl-bottom-right {
  bottom: 0.5rem;
}

.map-workspace .maplibregl-ctrl-group {
  border-radius: 6px;
  box-shadow: 0 1px 5px rgb(0 0 0 / 14%);
}

.map-workspace .maplibregl-ctrl button {
  width: 44px;
  height: 44px;
}

.map-workspace .maplibregl-canvas:focus-visible {
  outline: 2px solid #176f46;
  outline-offset: -2px;
}

.map-workspace .map-place-list {
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
  scrollbar-gutter: stable;
  touch-action: pan-y;
}

.map-workspace :deep(.map-float-btn),
.map-workspace :deep(button.map-float-btn) {
  background: #ffffff !important;
  background-color: #ffffff !important;
  color: #18181b !important;
  border: 1px solid #d4d4d8 !important;
  box-shadow: 0 2px 12px rgb(0 0 0 / 18%) !important;
  --ui-bg: #ffffff;
  --ui-text: #18181b;
  --ui-border: #d4d4d8;
}

.map-workspace :deep(.map-float-btn:hover),
.map-workspace :deep(button.map-float-btn:hover) {
  background: #f4f4f5 !important;
  background-color: #f4f4f5 !important;
}

.map-workspace :deep(.map-float-btn:disabled),
.map-workspace :deep(button.map-float-btn:disabled) {
  background: #ffffff !important;
  opacity: 0.75;
}

.map-workspace :deep(.map-control-btn),
.map-workspace :deep(button.map-control-btn) {
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  color: #27272a !important;
}

.map-workspace :deep(.map-control-btn:hover),
.map-workspace :deep(button.map-control-btn:hover) {
  background: #f4f4f5 !important;
}

.map-workspace :deep(.map-control-btn:focus-visible),
.map-workspace :deep(button.map-control-btn:focus-visible) {
  position: relative;
  z-index: 1;
  outline: 2px solid #15803d;
  outline-offset: -2px;
}

.map-workspace :deep(.map-float-btn .iconify),
.map-workspace :deep(.map-float-btn svg),
.map-workspace :deep(.map-float-btn [class*="i-lucide"]) {
  color: #18181b !important;
  opacity: 1 !important;
}

/* At 320px the provider badge and centered view switch share the same row. */
@media (max-width: 359px) {
  .map-workspace .map-provider-badges {
    padding-top: 3.25rem;
  }
}
</style>
