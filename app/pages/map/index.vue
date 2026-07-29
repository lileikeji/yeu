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
  resolveMobileSheetHeightClass,
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
  description: '查找仰恩大学教学楼、宿舍、食堂、服务点与校园周边地点。',
  robots: 'noindex, nofollow'
})

const route = useRoute()
const categories = mapCategories
const categoryIds = mapCategoryIds
const initialCategory = mapQueryValue(route.query.category)
const initialPlace = mapQueryValue(route.query.place)
const { data: publicPlaceResponse, error: publicPlaceError } = await usePublicPlaceList()
const { data: amapOwnerDraftResponse } = await usePublicAmapOwnerDraftPlaces()
const ownerMapSeeds = computed(() => mergeAmapImportedPlacesWithDrafts(
  amapImportedPlaces,
  amapOwnerDraftResponse.value?.items
))
const catalogPlaces = computed(() => mergePublicMapPlaces(
  campusMapReferencePlaces,
  publicPlaceResponse.value?.items ?? [],
  ownerMapSeeds.value
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
const canShowOfficialPlan = computed(() => canShowOfficialCampusPlan(activeScope.value))
const mapViewMode = ref<'geographic' | 'official-plan'>(
  resolveInitialMapViewMode({
    activeScope: activeScope.value,
    publishedCount: publishedPlacesInScope.value.length,
    ownerMapCount: ownerMapPlacesInScope.value.length
  })
)
const mobileSheetState = ref<MobileSheetState>(initialSelectedPoiId ? 'collapsed' : 'half')
const sidebarCollapsed = ref(false)
const displaySettingsOpen = ref(false)
const mapBaseStyle = ref<MapBaseStyle>('standard')
const mapDisplayOptions = ref<MapDisplayOptions>({ ...defaultMapDisplayOptions })
const mobileSheetHeightClass = computed(() => resolveMobileSheetHeightClass(mobileSheetState.value))
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
const searchQuery = ref(mapQueryValue(route.query.q))
const activeCategory = ref(resolveInitialMapCategoryId(initialCategory, categoryIds))
const selectedPoiId = ref<string | null>(initialSelectedPoiId)
const selectedArea = ref<MapArea | null>(null)
const selectedAreaId = computed(() => selectedArea.value?.id ?? null)
const selectedNativePlace = ref<PublicMapPlace | null>(null)
const toast = useToast()
const {
  locating,
  routePlanning,
  routeSummary,
  routeDestinationName,
  routeSummaryText,
  locateUser,
  startWalkingRoute,
  clearWalkingRoute
} = useMapGeolocation({
  mapProvider,
  activeMapProviderId,
  notify: notice => toast.add(notice)
})
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
  onResultsReady: autoSelectSearchResult
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
  if (decision.flyAction === 'fly-to-point' && poi.point) {
    mapProvider.value?.flyToPoint(poi.point, 18)
  } else if (decision.flyAction === 'fly-to-poi') {
    mapProvider.value?.flyToPoi(poi.id)
  }
}

function setMapViewMode(nextMode: 'geographic' | 'official-plan') {
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
  const reset = resolveSearchQueryChangeReset()
  lastAutoLocatedSearchKey = reset.lastAutoLocatedSearchKey
  selectedNativePlace.value = reset.selectedNativePlace
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
  onReady: queueNativeSearch
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
  autoSelectSearchResult()
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

onBeforeUnmount(() => {
  cancelMapRouteSync()
  cancelNativeSearch()
  clearWalkingRoute()
})
</script>

<template>
  <div
    class="map-workspace relative h-[calc(100dvh-var(--header-height)-var(--mobile-nav-height))] min-h-0 overflow-hidden bg-white md:grid md:h-[calc(100dvh-var(--header-height))] md:min-h-[40rem] md:grid-rows-1"
    :class="sidebarCollapsed ? 'md:grid-cols-1' : 'md:grid-cols-[18rem_minmax(0,1fr)]'"
  >
    <aside
      class="absolute inset-x-0 bottom-0 z-30 flex min-h-0 min-w-0 flex-col rounded-t-md bg-white transition-[height] duration-200 md:pointer-events-auto md:static md:order-1 md:h-auto md:rounded-none md:border-r md:border-t-0 md:shadow-none"
      :class="[
        mobileSheetHeightClass,
        mobileSheetState === 'collapsed'
          ? 'border-0 shadow-none'
          : 'border-t border-[var(--line)] shadow-[0_-6px_24px_rgb(0_0_0/12%)]',
        selectedPoi && mobileSheetState !== 'collapsed'
          ? 'overflow-y-auto overscroll-y-contain md:overflow-hidden'
          : 'overflow-hidden',
        sidebarCollapsed ? 'md:hidden' : ''
      ]"
    >
      <div class="flex h-20 shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] px-4 md:hidden">
        <div class="min-w-0">
          <div class="mx-auto mb-2 h-1 w-10 rounded-full bg-zinc-300" />
          <p class="truncate text-sm font-semibold text-zinc-900">
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
              class="size-11"
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
              class="size-11"
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
              class="size-11"
              aria-label="展开地点面板"
              :aria-pressed="mobileSheetState === 'expanded'"
              @click="() => { mobileSheetState = 'expanded' }"
            />
          </UTooltip>
        </div>
      </div>

      <div
        class="shrink-0 border-b border-[var(--line)] px-4 py-3 md:block md:px-5 md:py-4"
        :class="mobileSheetState === 'collapsed' ? 'hidden' : 'block'"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs font-semibold text-green-700">
              YEU CAMPUS
            </p>
            <h1 class="mt-1 text-lg font-bold text-zinc-950">
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
          v-model="searchQuery"
          size="lg"
          class="mt-3 min-h-11 w-full"
          :ui="{ base: 'min-h-11' }"
          icon="i-lucide-search"
          placeholder="搜索地点或附近商家"
          aria-label="搜索地图地点"
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
              @click="() => { searchQuery = '' }"
            />
          </template>
        </UInput>

        <div
          class="mt-3 grid grid-cols-4 gap-1.5 md:flex md:overflow-x-auto md:pb-1"
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
            class="min-h-11 min-w-0 justify-center px-1 md:shrink-0 md:px-2.5"
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
          class="mt-2 text-xs text-zinc-500"
          role="status"
        >
          正在搜索地图里的地点…
        </p>
        <p
          v-else-if="searchQuery.trim() && nativeSearchResults.length"
          class="mt-2 text-xs leading-5 text-zinc-500"
          role="status"
        >
          地图搜索找到 {{ nativeSearchResults.length }} 个附近地点；会自动定位到最相关的地点，但不会加入地点列表。
        </p>
      </div>

      <div
        class="items-center justify-between border-b border-[var(--line)] px-4 py-2 text-xs text-zinc-500 md:flex md:px-5"
        :class="mobileSheetState === 'collapsed' ? 'hidden md:flex' : 'flex'"
      >
        <span>{{ filteredPois.length }} 个地点</span>
        <button
          class="min-h-11 min-w-11 px-2 font-medium text-green-700 hover:text-green-800"
          type="button"
          @click="fitToVisiblePois"
        >
          查看全部
        </button>
      </div>

      <div
        class="min-h-0 flex-1 overflow-y-auto overscroll-y-contain md:block"
        :class="mobileSheetState === 'collapsed' ? 'hidden md:block' : 'block'"
        aria-label="地点列表"
      >
        <button
          v-for="poi in filteredPois"
          :key="poi.id"
          :ref="poiRowRef(poi.id)"
          type="button"
          class="flex w-full items-center gap-3 border-b border-zinc-100 px-4 py-3 text-left transition hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-green-700 md:px-5"
          :class="selectedPoiId === poi.id ? 'bg-green-50' : 'bg-white'"
          @click="selectPoi(poi)"
        >
          <span
            class="grid size-9 shrink-0 place-items-center rounded-md"
            :class="selectedPoiId === poi.id ? 'bg-green-700 text-white' : 'bg-zinc-100 text-zinc-600'"
          >
            <UIcon
              :name="categoryIcon(poi.category)"
              class="size-4"
            />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-semibold text-zinc-900">{{ poi.name }}</span>
            <span class="mt-0.5 block text-xs text-zinc-500">{{ categoryLabel(poi.category) }} · {{ poiStatusText(poi) }}</span>
          </span>
          <UIcon
            name="i-lucide-chevron-right"
            class="size-4 shrink-0 text-zinc-400"
          />
        </button>

        <div
          v-if="filteredPois.length === 0"
          class="grid min-h-32 place-items-center p-6 text-center"
        >
          <div>
            <UIcon
              name="i-lucide-map-pin-off"
              class="mx-auto size-6 text-zinc-400"
            />
            <p class="mt-2 text-sm font-medium text-zinc-700">
              没有匹配的地点
            </p>
          </div>
        </div>
      </div>
    </aside>

    <section
      class="absolute inset-0 isolate min-h-0 min-w-0 overflow-hidden bg-[#e5ebe7] md:relative md:inset-auto md:order-2"
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
        v-show="mapViewMode === 'official-plan'"
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
          class="pointer-events-auto absolute left-1/2 top-0 flex -translate-x-1/2 overflow-hidden rounded-md border border-white/40 bg-white shadow-sm"
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
          class="pointer-events-auto flex flex-col gap-2"
        >
          <UTooltip text="地图显示设置">
            <UButton
              icon="i-lucide-layers-3"
              color="neutral"
              variant="outline"
              class="map-float-btn size-11"
              :class="displaySettingsOpen ? 'ring-2 ring-green-600' : ''"
              aria-label="地图显示设置"
              :aria-expanded="displaySettingsOpen"
              @click="() => { displaySettingsOpen = !displaySettingsOpen }"
            />
          </UTooltip>
          <UTooltip text="显示全部地点">
            <UButton
              icon="i-lucide-scan"
              color="neutral"
              variant="outline"
              class="map-float-btn size-11"
              aria-label="显示全部地点"
              @click="fitToVisiblePois"
            />
          </UTooltip>
          <UTooltip text="定位到我的位置">
            <UButton
              icon="i-lucide-locate-fixed"
              color="neutral"
              variant="outline"
              :loading="locating"
              class="map-float-btn size-11"
              aria-label="定位到我的位置"
              @click="locateUser"
            />
          </UTooltip>
        </div>
      </div>

      <!-- Mobile: reopen fully-hidden place list -->
      <div
        v-if="mobileSheetState === 'collapsed'"
        class="pointer-events-none absolute inset-x-0 bottom-[calc(var(--mobile-nav-height)+0.5rem)] z-30 flex justify-center px-3 md:hidden"
        :class="selectedPoi ? 'bottom-[calc(var(--mobile-nav-height)+min(38dvh,18rem)+0.85rem)]' : ''"
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
        class="absolute left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-md border border-green-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-sm md:bottom-14"
        :class="selectedPoi
          ? 'bottom-[calc(var(--mobile-nav-height)+min(38dvh,18rem)+1.25rem)]'
          : 'bottom-[calc(var(--mobile-nav-height)+5.5rem)]'"
        role="status"
      >
        <UIcon
          name="i-lucide-route"
          class="size-5 shrink-0 text-green-700"
        />
        <div class="min-w-0 whitespace-nowrap">
          <p class="max-w-48 truncate text-xs font-semibold text-zinc-900">
            步行至 {{ routeDestinationName }}
          </p>
          <p class="mt-0.5 text-xs text-zinc-600">
            {{ routeSummaryText(routeSummary) }}
          </p>
        </div>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="清除步行路线"
          @click="clearWalkingRoute"
        />
      </div>

      <div
        v-if="mapViewMode === 'geographic' && mapStatus !== 'ready'"
        class="absolute inset-0 z-40 grid place-items-start p-4 pt-32 text-center md:place-items-center md:p-6"
        :class="mapStatus === 'loading' ? 'pointer-events-auto bg-[#e5ebe7]/95' : 'pointer-events-none'"
        :role="mapStatus === 'loading' ? 'status' : 'alert'"
      >
        <div v-if="mapStatus === 'loading'">
          <UIcon
            name="i-lucide-loader-circle"
            class="mx-auto size-7 animate-spin text-green-700"
          />
          <p class="mt-3 text-sm font-semibold text-zinc-800">
            正在载入地图
          </p>
        </div>
        <div
          v-else
          class="pointer-events-auto max-w-sm rounded-lg border border-zinc-200 bg-white/95 p-5 shadow-lg backdrop-blur-sm"
        >
          <UIcon
            name="i-lucide-map-pin-off"
            class="mx-auto size-8 text-zinc-500"
          />
          <p class="mt-3 text-sm font-semibold text-zinc-900">
            地图画面暂时没有显示出来
          </p>
          <p class="mt-1 text-xs leading-5 text-zinc-500">
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
        <div class="max-w-sm border border-zinc-200 bg-white/95 px-4 py-3 text-center shadow-sm backdrop-blur-sm">
          <UIcon
            name="i-lucide-map-pin-off"
            class="mx-auto size-5 text-zinc-500"
          />
          <p class="mt-2 text-sm font-semibold text-zinc-900">
            当前地图还没有可直接显示的地点
          </p>
          <p class="mt-1 text-xs leading-5 text-zinc-500">
            {{ activeMapProviderId === 'amap'
              ? '左侧目录仍可搜索；部分地图地点可以直接显示，平面图中的文字地点不会被强行放到错误的位置。'
              : '绿色虚线只表示校园的大致范围。左侧目录仍可搜索；没有确认位置的地点不会硬塞到地图上。' }}
          </p>
          <UButton
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
        class="absolute left-3 z-30 w-[min(22rem,calc(100%-1.5rem))] rounded-lg border border-zinc-200 bg-white p-4 shadow-xl md:bottom-12 md:left-4"
        :class="mobileSheetState === 'collapsed' || selectedPoi
          ? 'bottom-[calc(var(--mobile-nav-height)+0.75rem)] md:bottom-12'
          : 'bottom-[calc(44%+1rem)] md:bottom-12'"
        aria-live="polite"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="flex items-center gap-2 text-xs font-medium text-green-700">
              <UIcon
                name="i-lucide-pentagon"
                class="size-4"
              />
              地图范围
            </div>
            <h2 class="mt-1 text-base font-bold text-zinc-950">
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
        <p class="mt-3 text-xs leading-5 text-zinc-600">
          {{ selectedArea.description ?? '这个范围来自地图绘制，只用来帮助你辨认校园方向。' }}
        </p>
        <dl class="mt-3 grid grid-cols-2 gap-3 border-t border-zinc-100 pt-3 text-xs">
          <div>
            <dt class="text-zinc-400">
              面积
            </dt>
            <dd class="mt-1 font-medium text-zinc-800">
              {{ formatAreaSquareMeters(selectedArea.areaSquareMeters) }}
            </dd>
          </div>
          <div>
            <dt class="text-zinc-400">
              周长
            </dt>
            <dd class="mt-1 font-medium text-zinc-800">
              {{ formatPerimeter(selectedArea.perimeterMeters) }}
            </dd>
          </div>
        </dl>
        <p class="mt-3 text-[11px] leading-4 text-zinc-500">
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
      />
    </section>
  </div>
</template>

<style>
.map-workspace {
  /* Older WeChat WebViews may not parse dvh, so keep a real viewport fallback. */
  height: calc(100vh - var(--header-height) - var(--mobile-nav-height));
}

@media (min-width: 768px) {
  .map-workspace {
    height: calc(100vh - var(--header-height));
  }
}

@supports (height: 100dvh) {
  .map-workspace {
    height: calc(100dvh - var(--header-height) - var(--mobile-nav-height));
  }
}

@supports (height: 100dvh) and (min-width: 768px) {
  .map-workspace {
    height: calc(100dvh - var(--header-height));
  }
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

.map-workspace :deep(.map-float-btn .iconify),
.map-workspace :deep(.map-float-btn svg),
.map-workspace :deep(.map-float-btn [class*="i-lucide"]) {
  color: #18181b !important;
  opacity: 1 !important;
}

/*
 * The map keeps the full 44px marker hit area on phones, but showing every
 * name at once makes nearby campus points unreadable. The selected marker
 * remains labeled so the current place is still obvious.
 */
@media (max-width: 639px) {
  .map-workspace .yeu-amap-poi-label:not(.yeu-amap-poi-label-selected),
  .map-workspace .yeu-amap-area-label:not(.yeu-amap-area-label-selected) {
    display: none !important;
  }
}

/* At 320px the provider badge and centered view switch share the same row. */
@media (max-width: 359px) {
  .map-workspace .map-provider-badges {
    padding-top: 3.25rem;
  }
}
</style>
