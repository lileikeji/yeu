import type { MapArea, MapPoi } from '~~/map/core/types'
import type { MapProvider } from '~~/map/core/provider'
import type { PublicMapPlace } from '~/utils/public-catalog'
import { createNativeMapPlace } from '~/utils/map-native-search'
import { safeLocalPath } from '~/utils/safe-navigation'
import {
  buildMapPlaceDetailsTarget,
  buildMapPlaceFeedbackTarget,
  buildMapPoiLocationCopyText,
  buildMapPoiUseChecklist,
  resolveAreaSelectedDecision,
  resolveCloseAreaDetailsDecision,
  resolveClosePoiDetailsDecision,
  resolveMapCategoryIcon,
  resolveMapCategoryLabel,
  resolveMapPoiClickApply,
  resolveMapPoiStatusText,
  resolveOfficialPlanNumber,
  resolveSelectedMapPoiId,
  resolveSelectedPublicMapPlace,
  resolveSelectAreaDecision,
  resolveSelectOfficialPlanNumberDecision,
  resolveSelectPoiApplyDecision,
  shouldClearSelectedMapPoiOnListChange,
  type MapViewMode,
  type MobileSheetState
} from '~/utils/map-presentation'

type MapPlaceScope = PublicMapPlace['scope']

interface ValueRef<T> {
  value: T
}

interface ReadonlyValueRef<T> {
  readonly value: T
}

interface UseMapPoiOptions {
  places: ReadonlyValueRef<PublicMapPlace[]>
  activeScope: ReadonlyValueRef<MapPlaceScope | null>
  filteredPois: ReadonlyValueRef<PublicMapPlace[]>
  filteredMapPois: ReadonlyValueRef<MapPoi[]>
  nativeSearchResults: ReadonlyValueRef<PublicMapPlace[]>
  searchQuery: ValueRef<string>
  activeCategory: ValueRef<string>
  selectedPoiId: ValueRef<string | null>
  selectedNativePlace: ValueRef<PublicMapPlace | null>
  selectedArea: ValueRef<MapArea | null>
  mapProvider: ValueRef<MapProvider | null>
  mapViewMode: ValueRef<MapViewMode>
  canShowOfficialPlan: ReadonlyValueRef<boolean>
  mobileSheetState: ValueRef<MobileSheetState>
  sidebarCollapsed: ValueRef<boolean>
  copyText: (value: string, label?: string) => Promise<boolean>
}

export function useMapPoi(options: UseMapPoiOptions) {
  const route = useRoute()
  const { selectedPoiId, selectedNativePlace, selectedArea, mapProvider } = options
  const poiRowElements = new Map<string, HTMLElement>()

  const selectedAreaId = computed(() => selectedArea.value?.id ?? null)
  const selectedMapPoiId = computed(() => resolveSelectedMapPoiId(
    options.filteredMapPois.value,
    selectedPoiId.value
  ))

  const selectedPoi = computed(() => resolveSelectedPublicMapPlace({
    places: options.places.value,
    selectedNativePlace: selectedNativePlace.value,
    nativeSearchResults: options.nativeSearchResults.value,
    selectedPoiId: selectedPoiId.value
  }))
  const returnPath = computed(() => safeLocalPath(route.query.from))

  function placeDetailsTarget(poi: PublicMapPlace) {
    return buildMapPlaceDetailsTarget(poi, returnPath.value ?? route.fullPath)
  }

  function placeFeedbackTarget(poi: PublicMapPlace) {
    return buildMapPlaceFeedbackTarget(poi, route.fullPath)
  }

  function copyPoiLocation(poi: PublicMapPlace): void {
    void options.copyText(buildMapPoiLocationCopyText(poi), '地点信息')
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
      ? createNativeMapPlace(poi, options.activeScope.value)
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
      options.mobileSheetState.value = 'collapsed'
    }

    if (decision.expandSidebarAndScroll && decision.scrollToPoiId) {
      options.sidebarCollapsed.value = false
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

  function scrollToPoi(id: string): void {
    poiRowElements.get(id)?.scrollIntoView({ block: 'nearest' })
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
      mobileSheetState: options.mobileSheetState.value,
      mapViewMode: options.mapViewMode.value,
      canShowOfficialPlan: options.canShowOfficialPlan.value
    })
    selectedArea.value = decision.selectedArea
    mapProvider.value?.setSelectedArea(decision.providerSelectedAreaId)
    selectedNativePlace.value = decision.selectedNativePlace
    selectedPoiId.value = decision.selectedPoiId
    // 手机端只要有选中地点就收起面板，让地图露出来；别回到半屏。
    options.mobileSheetState.value = window.innerWidth < 768 && decision.mobileSheetState === 'half'
      ? 'collapsed'
      : decision.mobileSheetState
    options.mapViewMode.value = decision.mapViewMode
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

  function selectedOfficialPlanNumber(poi: PublicMapPlace | null): string | null {
    return resolveOfficialPlanNumber(poi)
  }

  function selectOfficialPlanNumber(mapNumber: string): void {
    const decision = resolveSelectOfficialPlanNumberDecision(options.places.value, mapNumber)
    if (!decision) return
    options.searchQuery.value = decision.searchQuery
    options.activeCategory.value = decision.activeCategory
    options.sidebarCollapsed.value = decision.sidebarCollapsed
    selectPoi(decision.poi)
  }

  function clearPoi() {
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

  watch(() => options.filteredPois.value, (pois) => {
    if (shouldClearSelectedMapPoiOnListChange({
      selectedPoiId: selectedPoiId.value,
      filteredPlaces: pois,
      nativeSearchResults: options.nativeSearchResults.value,
      selectedNativePlaceId: selectedNativePlace.value?.id
    })) {
      clearPoi()
    }
  }, { immediate: true })

  return {
    selectedPoi,
    selectedMapPoiId,
    selectedAreaId,
    returnPath,
    selectPoi,
    clearPoi,
    handlePoiSelected,
    handleAreaSelected,
    selectArea,
    closeAreaDetails,
    categoryLabel,
    categoryIcon,
    poiStatusText,
    poiUseChecklist,
    copyPoiLocation,
    placeDetailsTarget,
    placeFeedbackTarget,
    selectedOfficialPlanNumber,
    selectOfficialPlanNumber,
    poiRowRef,
    scrollToPoi
  }
}
