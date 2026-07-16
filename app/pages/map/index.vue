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
import { campusMapReferencePlaces } from '~~/data/seeds/preview-places'
import { amapImportedPlaces } from '~~/data/seeds/amap-imported-places'
import { amapImportedAreas } from '~~/data/seeds/amap-imported-areas'
import type { PublicMapPlace } from '~/utils/public-catalog'
import { mergeAmapImportedPlacesWithDrafts, mergePublicMapPlaces, toMapPoi } from '~/utils/public-catalog'
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
  findPublicMapPlaceByOfficialPlanNumber,
  formatMapAreaSquareMeters,
  formatMapPerimeter,
  mapCategories,
  mapCategoryIds,
  resolveAutoSelectSearchDecision,
  resolveInitialMapViewMode,
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
const canShowOfficialPlan = computed(() => activeScope.value !== 'nearby')
const mapViewMode = ref<'geographic' | 'official-plan'>(
  resolveInitialMapViewMode({
    activeScope: activeScope.value,
    publishedCount: publishedPlacesInScope.value.length,
    ownerMapCount: ownerMapPlacesInScope.value.length
  })
)
const mobileSheetState = ref<MobileSheetState>('half')
const sidebarCollapsed = ref(false)
const displaySettingsOpen = ref(false)
const mapBaseStyle = ref<MapBaseStyle>('standard')
const mapDisplayOptions = ref<MapDisplayOptions>({
  showPois: true,
  showAreas: true,
  showLabels: true,
  autoCluster: true,
  labelSize: 'medium'
})
const mobileSheetHeightClass = computed(() => resolveMobileSheetHeightClass(mobileSheetState.value))
const mapDataLabel = computed(() => resolveMapDataLabel({
  publishedCount: publishedPlacesInScope.value.length,
  ownerMapCount: ownerMapPlacesInScope.value.length,
  hasPublicPlaceError: Boolean(publicPlaceError.value),
  activeScope: activeScope.value
}))
const mapFallbackMessage = computed(() => resolveMapFallbackMessage({
  ownerMapCount: ownerMapPlacesInScope.value.length,
  hasPublicPlaceError: Boolean(publicPlaceError.value),
  activeScope: activeScope.value,
  publishedCount: publishedPlacesInScope.value.length
}))

const mapElement = ref<HTMLElement | null>(null)
const mapProvider = shallowRef<MapProvider | null>(null)
const activeMapProviderId = ref<MapProviderId | null>(null)
const mapStatus = ref<'loading' | 'ready' | 'error'>('loading')
const mapErrorMessage = ref('地图暂时无法加载，请检查网络和地图配置后重试。')
const searchQuery = ref(mapQueryValue(route.query.q))
const activeCategory = ref(categoryIds.has(initialCategory) ? initialCategory : 'all')
const initialSelectedPoi = places.value.find(poi => poi.slug === initialPlace || poi.id === initialPlace)
const selectedPoiId = ref<string | null>(initialSelectedPoi?.id ?? null)
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

const filteredMapPois = computed<MapPoi[]>(() => filteredPois.value.flatMap((place) => {
  const poi = toMapPoi(place)
  return poi ? [poi] : []
}))
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
  if (poi) {
    selectedArea.value = null
    mapProvider.value?.setSelectedArea(null)
  }
  const selected = poi?.source === 'amap-native'
    ? createNativeMapPlace(poi, activeScope.value)
    : null
  selectedNativePlace.value = selected
  selectedPoiId.value = poi?.source === 'amap-native'
    ? selected?.id ?? null
    : poi?.id ?? null
  mapProvider.value?.setSelectedPoi(selectedPoiId.value)

  if (poi && selectedPoiId.value) {
    if (poi.source !== 'amap-native') {
      sidebarCollapsed.value = false
      void nextTick(() => poiRowElements.get(selectedPoiId.value!)?.scrollIntoView({ block: 'nearest' }))
    }
  }
}

function handleAreaSelected(area: MapArea | null): void {
  selectedArea.value = area
  mapProvider.value?.setSelectedArea(area?.id ?? null)
  if (area) {
    selectedPoiId.value = null
    mapProvider.value?.setSelectedPoi(null)
  }
}

function selectArea(area: MapArea): void {
  selectedPoiId.value = null
  selectedNativePlace.value = null
  selectedArea.value = area
  mapProvider.value?.setSelectedPoi(null)
  mapProvider.value?.setSelectedArea(area.id)
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
  selectedArea.value = null
  mapProvider.value?.setSelectedArea(null)
  selectedNativePlace.value = poi.coordinateVerification === 'native-map-session' ? poi : null
  selectedPoiId.value = poi.id
  if (mobileSheetState.value === 'collapsed') mobileSheetState.value = 'half'
  if (poi.usesPreviewPoint && canShowOfficialPlan.value) mapViewMode.value = 'official-plan'
  mapProvider.value?.setSelectedPoi(poi.point ? poi.id : null)
  if (poi.point) {
    if (poi.coordinateVerification === 'native-map-session') mapProvider.value?.flyToPoint(poi.point, 18)
    else mapProvider.value?.flyToPoi(poi.id)
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

  if (decision.action === 'clear-key') {
    lastAutoLocatedSearchKey = ''
    return
  }
  if (decision.action === 'noop') return

  lastAutoLocatedSearchKey = decision.autoKey
  sidebarCollapsed.value = false
  if (decision.action === 'select-poi') {
    selectPoi(decision.target)
    if (decision.target.coordinateVerification !== 'native-map-session') {
      void nextTick(() => poiRowElements.get(decision.target.id)?.scrollIntoView({ block: 'nearest' }))
    }
    return
  }

  selectArea(decision.targetArea)
}
function selectedOfficialPlanNumber(poi: PublicMapPlace | null): string | null {
  return resolveOfficialPlanNumber(poi)
}

function selectOfficialPlanNumber(mapNumber: string): void {
  const poi = findPublicMapPlaceByOfficialPlanNumber(places.value, mapNumber)
  if (!poi) return
  searchQuery.value = ''
  activeCategory.value = 'all'
  sidebarCollapsed.value = false
  selectPoi(poi)
}

function closePoiDetails() {
  selectedPoiId.value = null
  selectedNativePlace.value = null
  mapProvider.value?.setSelectedPoi(null)
}

function closeAreaDetails(): void {
  selectedArea.value = null
  mapProvider.value?.setSelectedArea(null)
}

function setCategory(categoryId: string) {
  activeCategory.value = categoryId
  closePoiDetails()
}

function fitToVisiblePois() {
  closePoiDetails()
  closeAreaDetails()
  mapProvider.value?.fitToPois()
}

watch(searchQuery, () => {
  lastAutoLocatedSearchKey = ''
  selectedNativePlace.value = null
  queueNativeSearch()
})
watch(mapViewMode, queueNativeSearch)
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
  resizeSignal: sidebarCollapsed,
  onPoiSelected: handlePoiSelected,
  onAreaSelected: handleAreaSelected,
  beforeMount: clearWalkingRoute,
  onReady: queueNativeSearch
})

watch(filteredPois, (pois) => {
  const selectedIsNative = nativeSearchResults.value.some(poi => poi.id === selectedPoiId.value)
  const selectedIsNativeDetail = selectedNativePlace.value?.id === selectedPoiId.value
  if (selectedPoiId.value && !selectedIsNative && !selectedIsNativeDetail && !pois.some(poi => poi.id === selectedPoiId.value)) {
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
    class="map-workspace relative h-[calc(100dvh-var(--header-height)-var(--mobile-nav-height))] min-h-[34rem] overflow-hidden bg-white md:grid md:h-[calc(100dvh-var(--header-height))] md:min-h-[40rem] md:grid-rows-1"
    :class="sidebarCollapsed ? 'md:grid-cols-1' : 'md:grid-cols-[18rem_minmax(0,1fr)]'"
  >
    <aside
      class="absolute inset-x-0 bottom-0 z-30 flex min-h-0 min-w-0 flex-col rounded-t-md border-t border-[var(--line)] bg-white shadow-[0_-6px_24px_rgb(0_0_0/12%)] transition-[height] duration-200 md:static md:order-1 md:h-auto md:rounded-none md:border-r md:border-t-0 md:shadow-none"
      :class="[
        mobileSheetHeightClass,
        selectedPoi && mobileSheetState !== 'collapsed' ? 'overflow-y-auto' : 'overflow-hidden',
        sidebarCollapsed ? 'md:hidden' : ''
      ]"
    >
      <div class="flex h-20 shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] px-4 md:hidden">
        <div class="min-w-0">
          <div class="mx-auto mb-2 h-1 w-10 rounded-full bg-zinc-300" />
          <p class="truncate text-sm font-semibold text-zinc-900">
            {{ selectedPoi?.name ?? `地点列表 · ${filteredPois.length}` }}
          </p>
        </div>
        <div
          class="flex shrink-0 items-center gap-1"
          role="group"
          aria-label="地图面板高度"
        >
          <UTooltip text="收起地点面板">
            <UButton
              icon="i-lucide-chevrons-down"
              color="neutral"
              variant="ghost"
              class="size-9"
              aria-label="收起地点面板"
              :aria-pressed="mobileSheetState === 'collapsed'"
              @click="() => { mobileSheetState = 'collapsed' }"
            />
          </UTooltip>
          <UTooltip text="半屏显示地点面板">
            <UButton
              icon="i-lucide-minus"
              color="neutral"
              variant="ghost"
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
              class="size-9"
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
                class="hidden md:inline-flex"
                aria-label="收起地点栏"
                @click="() => { sidebarCollapsed = true }"
              />
            </UTooltip>
          </div>
        </div>

        <UInput
          v-model="searchQuery"
          class="mt-3 w-full"
          icon="i-lucide-search"
          placeholder="搜索地点或当前视野高德商家"
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
          class="scrollbar-none mt-3 flex gap-1.5 overflow-x-auto pb-1"
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
            class="min-h-11 shrink-0"
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
          正在搜索当前地图视野中的高德地点…
        </p>
        <p
          v-else-if="searchQuery.trim() && nativeSearchResults.length"
          class="mt-2 text-xs leading-5 text-zinc-500"
          role="status"
        >
          已在高德底图中找到 {{ nativeSearchResults.length }} 个临时地点；会自动定位到最相关地点，但不会加入左侧地点列表。
        </p>
      </div>

      <MapPlaceDetailsPanel
        v-if="selectedPoi && mobileSheetState !== 'collapsed'"
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
        :can-plan-route="activeMapProviderId === 'amap' && Boolean(selectedPoi.point)"
        :is-wechat="isWechat"
        @close="closePoiDetails"
        @copy="copyPoiLocation(selectedPoi)"
        @plan-route="startWalkingRoute(selectedPoi.name, selectedPoi.point)"
      />

      <div
        class="items-center justify-between border-b border-[var(--line)] px-4 py-2 text-xs text-zinc-500 md:flex md:px-5"
        :class="selectedPoi
          ? 'hidden'
          : mobileSheetState === 'collapsed'
            ? 'hidden md:flex'
            : 'flex'"
      >
        <span>{{ filteredPois.length }} 个地点</span>
        <button
          class="font-medium text-green-700 hover:text-green-800"
          type="button"
          @click="fitToVisiblePois"
        >
          查看全部
        </button>
      </div>

      <div
        class="min-h-0 flex-1 overflow-y-auto md:block"
        :class="selectedPoi
          ? 'hidden'
          : mobileSheetState === 'collapsed'
            ? 'hidden md:block'
            : 'block'"
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
      class="absolute inset-0 min-h-0 min-w-0 overflow-hidden bg-[#e5ebe7] md:relative md:inset-auto md:order-2"
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
        v-if="mapViewMode === 'official-plan'"
        :selected-map-number="selectedOfficialPlanNumber(selectedPoi)"
        :selected-reference-label="selectedPoi?.referenceLabel"
        :selected-place-name="selectedPoi?.name"
        @select-number="selectOfficialPlanNumber"
      />

      <div class="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-3 md:inset-x-4 md:top-4">
        <div class="flex flex-col items-start gap-1.5">
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
              ? '学校官网原图'
              : activeMapProviderId === 'amap'
                ? '高德地图'
                : 'OSM 预览底图' }}
          </UBadge>
          <UTooltip
            v-if="mapViewMode === 'geographic' && activeMapProviderId !== 'amap'"
            text="绿色虚线来自 OSM 社区测绘，只表示校园范围参考，不代表楼栋坐标已核验。"
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
              社区测绘校界
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
            size="xs"
            :color="mapViewMode === 'geographic' ? 'primary' : 'neutral'"
            :variant="mapViewMode === 'geographic' ? 'solid' : 'ghost'"
            class="rounded-none"
            :aria-pressed="mapViewMode === 'geographic'"
            @click="() => { mapViewMode = 'geographic' }"
          />
          <UButton
            icon="i-lucide-image"
            label="平面图"
            size="xs"
            :color="mapViewMode === 'official-plan' ? 'primary' : 'neutral'"
            :variant="mapViewMode === 'official-plan' ? 'solid' : 'ghost'"
            class="rounded-none"
            :aria-pressed="mapViewMode === 'official-plan'"
            @click="() => { mapViewMode = 'official-plan' }"
          />
        </div>
        <div
          v-if="mapViewMode === 'geographic'"
          class="pointer-events-auto flex flex-col gap-2"
        >
          <UTooltip text="地图图层与显示设置">
            <UButton
              icon="i-lucide-layers-3"
              color="neutral"
              :variant="displaySettingsOpen ? 'soft' : 'solid'"
              class="size-11"
              aria-label="地图图层与显示设置"
              :aria-expanded="displaySettingsOpen"
              @click="() => { displaySettingsOpen = !displaySettingsOpen }"
            />
          </UTooltip>
          <UTooltip text="显示全部地点">
            <UButton
              icon="i-lucide-scan"
              color="neutral"
              variant="solid"
              class="size-11"
              aria-label="显示全部地点"
              @click="fitToVisiblePois"
            />
          </UTooltip>
          <UTooltip text="定位到我的位置">
            <UButton
              icon="i-lucide-locate-fixed"
              color="neutral"
              variant="solid"
              :loading="locating"
              class="size-11"
              aria-label="定位到我的位置"
              @click="locateUser"
            />
          </UTooltip>
        </div>
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
        class="absolute bottom-14 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-md border border-green-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-sm"
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
        class="absolute inset-0 z-20 grid place-items-center p-6 text-center"
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
          class="pointer-events-auto max-w-xs rounded-lg border border-zinc-200 bg-white/95 p-5 shadow-lg backdrop-blur-sm"
        >
          <UIcon
            name="i-lucide-map-off"
            class="mx-auto size-8 text-zinc-500"
          />
          <p class="mt-3 text-sm font-semibold text-zinc-900">
            地图暂时无法载入
          </p>
          <p class="mt-1 text-xs leading-5 text-zinc-500">
            {{ mapErrorMessage }}地点列表仍可继续浏览。
          </p>
          <UButton
            class="mt-4"
            icon="i-lucide-refresh-cw"
            label="重新载入"
            color="neutral"
            variant="outline"
            size="sm"
            @click="mountMap"
          />
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
            暂无可在当前底图展示的已核验标点
          </p>
          <p class="mt-1 text-xs leading-5 text-zinc-500">
            {{ activeMapProviderId === 'amap'
              ? '左侧目录仍可搜索；已导入的高德标点会直接使用高德坐标显示，平面图文字索引不强行生成假坐标。'
              : '绿色虚线仅表示 OSM 社区测绘校界。左侧目录仍可搜索；没有可兼容坐标的地点不会强行生成假标点。' }}
          </p>
          <UButton
            :to="officialSources.campusMap.url"
            target="_blank"
            icon="i-lucide-external-link"
            label="查看官网文字索引"
            color="neutral"
            variant="outline"
            size="sm"
            class="pointer-events-auto mt-3"
          />
        </div>
      </div>

      <section
        v-if="selectedArea"
        class="absolute bottom-[calc(44%+1rem)] left-3 z-30 w-[min(22rem,calc(100%-1.5rem))] rounded-lg border border-zinc-200 bg-white p-4 shadow-xl md:bottom-12 md:left-4"
        aria-live="polite"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="flex items-center gap-2 text-xs font-medium text-green-700">
              <UIcon
                name="i-lucide-pentagon"
                class="size-4"
              />
              高德绘制区域
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
          {{ selectedArea.description ?? '边界来自用户授权的高德工作地图原始绘制数据，仅作校园方位参考。' }}
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
          区域只绘制边界线，不覆盖内部商铺的点击区域。
        </p>
      </section>

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
        :can-plan-route="activeMapProviderId === 'amap' && Boolean(selectedPoi.point)"
        :is-wechat="isWechat"
        @close="closePoiDetails"
        @copy="copyPoiLocation(selectedPoi)"
        @plan-route="startWalkingRoute(selectedPoi.name, selectedPoi.point)"
      />
    </section>
  </div>
</template>

<style>
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
</style>
