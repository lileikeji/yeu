import type { MapArea, MapPoi } from '~~/map/core/types'
import type { MapProvider } from '~~/map/core/provider'
import type { PublicMapPlace } from '~/utils/public-catalog'
import { amapImportedAreas } from '~~/data/seeds/amap-imported-areas'
import { mapQueryValue, type MapRouteScope } from '~/utils/map-route-state'
import {
  buildFilteredMapPois,
  filterMapAreasForMapSearch,
  filterMapAreasForProviderScope,
  filterPublicMapPlacesForMapList,
  mapCategories,
  mapCategoryIds,
  resolveFitToVisiblePoisDecision,
  resolveInitialMapCategoryId,
  resolveMapDataLabel,
  resolveMapFallbackMessage,
  resolveSetCategoryDecision
} from '~/utils/map-presentation'

interface ValueRef<T> {
  value: T
}

interface ReadonlyValueRef<T> {
  readonly value: T
}

interface UseMapFilterOptions {
  places: ReadonlyValueRef<PublicMapPlace[]>
  activeScope: ReadonlyValueRef<MapRouteScope>
  // 只用于计数（已发布/自绘点数量），不参与列表渲染，故不绑定具体条目类型。
  publishedPlacesInScope: ReadonlyValueRef<readonly unknown[]>
  ownerMapPlacesInScope: ReadonlyValueRef<readonly unknown[]>
  hasPublicPlaceError: ReadonlyValueRef<boolean>
  selectedPoiId: ValueRef<string | null>
  selectedNativePlace: ValueRef<PublicMapPlace | null>
  selectedArea: ValueRef<MapArea | null>
  mapProvider: ValueRef<MapProvider | null>
}

export function useMapFilter(options: UseMapFilterOptions) {
  const route = useRoute()
  const categories = mapCategories
  const categoryIds = mapCategoryIds
  const initialCategory = mapQueryValue(route.query.category)
  // 仅当 query 来自分享/直达链接时，首次列表就绪后自动定位一次；
  // 手动输入只更新列表，由用户点选后再定位。
  const deepLinkSearchQuery = mapQueryValue(route.query.q)
  const searchQuery = ref(deepLinkSearchQuery)
  // 中文输入法（拼音/手写）组词期间 value 是中间拼音，不能触发搜索/筛选。
  // 组词结束（compositionend）后按最终值提交一次。
  const searchIsComposing = ref(false)
  const activeCategory = ref(resolveInitialMapCategoryId(initialCategory, categoryIds))

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

  const filteredPois = computed(() => filterPublicMapPlacesForMapList(options.places.value, {
    query: searchQuery.value,
    activeScope: options.activeScope.value,
    activeCategory: activeCategory.value
  }))

  const filteredMapPois = computed<MapPoi[]>(() => buildFilteredMapPois(filteredPois.value))
  const filteredAreas = computed(() => filterMapAreasForMapSearch(amapImportedAreas, {
    query: searchQuery.value,
    activeScope: options.activeScope.value
  }))
  const providerAreas = computed(() => filterMapAreasForProviderScope(amapImportedAreas, options.activeScope.value))

  const mapDataLabel = computed(() => resolveMapDataLabel({
    publishedCount: options.publishedPlacesInScope.value.length,
    ownerMapCount: options.ownerMapPlacesInScope.value.length,
    hasPublicPlaceError: options.hasPublicPlaceError.value,
    activeScope: options.activeScope.value
  }))
  const mapFallbackMessage = computed(() => resolveMapFallbackMessage({
    ownerMapCount: options.ownerMapPlacesInScope.value.length,
    areaCount: filterMapAreasForProviderScope(amapImportedAreas, options.activeScope.value).length,
    hasPublicPlaceError: options.hasPublicPlaceError.value,
    activeScope: options.activeScope.value,
    publishedCount: options.publishedPlacesInScope.value.length
  }))

  function setCategory(categoryId: string) {
    const decision = resolveSetCategoryDecision(categoryId)
    activeCategory.value = decision.activeCategory
    options.selectedPoiId.value = decision.selectedPoiId
    options.selectedNativePlace.value = decision.selectedNativePlace
    options.mapProvider.value?.setSelectedPoi(decision.providerSelectedPoiId)
  }

  function fitToVisiblePois() {
    const decision = resolveFitToVisiblePoisDecision()
    options.selectedPoiId.value = decision.selectedPoiId
    options.selectedNativePlace.value = decision.selectedNativePlace
    options.selectedArea.value = decision.selectedArea
    options.mapProvider.value?.setSelectedPoi(decision.providerSelectedPoiId)
    options.mapProvider.value?.setSelectedArea(decision.providerSelectedAreaId)
    if (decision.shouldFitToPois) {
      options.mapProvider.value?.fitToPois()
    }
  }

  return {
    categories,
    categoryIds,
    deepLinkSearchQuery,
    searchQuery,
    activeCategory,
    filteredPois,
    filteredMapPois,
    filteredAreas,
    providerAreas,
    mapDataLabel,
    mapFallbackMessage,
    onSearchQueryInput,
    onSearchCompositionStart,
    onSearchCompositionEnd,
    clearSearchQuery,
    setCategory,
    fitToVisiblePois
  }
}
