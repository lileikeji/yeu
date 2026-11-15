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
import type { GlassTarget } from '~/composables/useMapGlassRefraction'
import { campusMapReferencePlaces } from '~~/data/seeds/preview-places'
import { amapImportedPlaces } from '~~/data/seeds/amap-imported-places'
import { amapImportedAreas } from '~~/data/seeds/amap-imported-areas'
import type { PublicMapPlace } from '~/utils/public-catalog'
import { mergeAmapImportedPlacesWithDrafts, mergePublicMapPlaces } from '~/utils/public-catalog'
import { mapQueryValue, mapRouteScope } from '~/utils/map-route-state'
import {
  filterOwnerMapPlacesInScope,
  filterPublicMapPlacesByScope,
  formatMapAreaSquareMeters,
  formatMapPerimeter,
  MAP_LOAD_ERROR_MESSAGE,
  canPlanMapWalkingRoute,
  defaultMapDisplayOptions,
  canShowOfficialCampusPlan,
  resolveMapViewModeSwitchDecision,
  resolveAutoSelectSearchDecision,
  resolveAutoSelectSearchApply,
  resolveSearchQueryChangeReset,
  resolveInitialMapViewMode,
  resolveInitialSelectedMapPoiId,
  resolveMapUnsupportedBaseStyleMessage,
  resolveMobileSheetAnchors,
  resolveMobileSheetHeightClass,
  resolveMobileSheetStateFromHeight,
  toggleMapDisplayOption,
  withMapLabelSize,
  type MapDisplayToggleKey,
  type MobileSheetState
} from '~~/app/utils/map-presentation'

useSeoMeta({
  title: '校园地图',
  description: '查找教学楼、宿舍、食堂、服务点与校园周边地点。',
  robots: 'noindex, nofollow'
})

const route = useRoute()
// Temporarily keep the official floor-plan data available without exposing a
// public entry point. Re-enable this switch when the plan is ready to return.
const OFFICIAL_PLAN_ENTRY_VISIBLE = false
const initialPlace = mapQueryValue(route.query.place)
const { data: publicPlaceResponse, error: publicPlaceError } = await usePublicPlaceList()
const { data: amapOwnerDraftResponse } = await usePublicAmapOwnerDraftPlaces()
const { data: activityPlaceResponse } = await useFetch<{ placeIds: string[] }>(
  '/api/public/activity-place-markers',
  { key: 'public-activity-place-markers' }
)
const activityPlaceIds = computed(() => new Set(activityPlaceResponse.value?.placeIds ?? []))
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
).map(place => activityPlaceIds.value.has(place.id)
  ? { ...place, hasActivities: true }
  : place
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
// 手机端一进来先把地点栏收起来：半屏面板会把地图压到两百多像素，
// 楼栋图标全在面板底下，点了当然没反应。收起来后地图全屏可点，列表往上拖就有。
// SSR 拿不到 window，先按桌面给 half；挂载后再在手机端收起（见 onMounted），
// 否则 SSR 出来的半屏会被 hydration 原样保留，地图只剩两百多像素高。
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

/*
 * T-019：移动端浮动件（校车胶囊 / 浏览数 / 高德 attribution）统一贴在面板上沿之上 12px。
 * 用 ResizeObserver 量面板实际高度，而不是按状态查表——面板高度有 200ms 过渡、还能手指拖，
 * 查表只拿得到终值，胶囊会在动画期间穿进面板里。
 */
const mobileSheetLiveHeightPx = ref(152)
const mobileDockBottom = computed(() => Math.max(0, Math.round(mobileSheetLiveHeightPx.value + 12)))
let mobileSheetResizeObserver: ResizeObserver | null = null

const mapElement = ref<HTMLElement | null>(null)
const mapProvider = shallowRef<MapProvider | null>(null)

/*
 * 移动端玻璃折射（T-018 接 useMapGlassRefraction）
 * - 底图 canvas 每帧整张重传，玻璃层按 5 个浮层元素的实时矩形画折射；
 * - 桌面（≥768px）不启用：浮层本身 md:hidden，画布容器也 md:hidden，量到 0×0 就空转不画；
 * - 起不来（无 WebGL2 / 上下文丢失 / iOS PWA）时 ready 一直是 false，
 *   模板回落到 .map-glass-surface 的 backdrop-filter，不报错也不塌；
 * - 开关状态存 localStorage；P-004 notes-E 当时还没落盘，键名在这里自定并写进回执。
 */
// 键名沿用项目既有约定（`yeu-palette` / `yeu-admin-sidebar-collapsed`），不用冒号分段。
const MAP_GLASS_STORAGE_KEY = 'yeu-map-glass-refraction'
const MAP_GLASS_LOW_FPS = 40
const glassLayerElement = ref<HTMLElement | null>(null)
const glassSearchElement = ref<HTMLElement | null>(null)
const glassChipsElement = ref<HTMLElement | null>(null)
const glassSourceElement = ref<HTMLElement | null>(null)
const glassLocateElement = ref<HTMLElement | null>(null)
const glassEnabled = ref(true)
/** 低帧降级档：1 → 0.4 → 0（0 = 停渲染，回退 CSS blur）。 */
const glassStrengthScale = ref(1)
let glassLowFpsSamples = 0

/**
 * 4 个玻璃目标。参数按 T-018 spec 起步值，用 390×844 截图校对后定稿（见回执）。
 * T-020 起底部面板不再是 target：折射画布在地图 z-18、面板 z-30，面板里 header 与提示行
 * 会被折射出来的楼栋标注顶穿（半屏态实测可读性不达标），面板改用 90% 白纱 + blur(16px)。
 * 返回空数组等于不渲染，所以关开关 / 降级到 0 都不需要另写停机分支。
 */
function resolveGlassTargets(): GlassTarget[] {
  if (!glassEnabled.value || glassStrengthScale.value <= 0) return []
  const targets: GlassTarget[] = []
  const push = (element: HTMLElement | null, radius: number, strengthMul: number, frost: number): void => {
    if (element) targets.push({ element, radius, strengthMul: strengthMul * glassStrengthScale.value, frost })
  }
  push(glassChipsElement.value, 0.5, 2, 0.25)
  // T-023：底部面板重新进 target。radius 0.043 → min(390,326)×0.043×2 ≈ 28px，对齐 rounded-t-[28px]；
  // frost 压到 0.18（chips 是 0.25），别把底图糊平。
  push(mobileSheetElement.value, 0.043, 1.4, 0.18)
  push(glassLocateElement.value, 0.35, 1.4, 0)
  push(glassSearchElement.value, 0.5, 1.8, 0.3)
  return targets
}

const { attach: attachMapGlass, start: startMapGlass, stop: stopMapGlass, ready: mapGlassReady, fps: mapGlassFps } = useMapGlassRefraction({
  strength: 36,
  // 底图 canvas 由 provider 建在 mapElement 里（maplibre 的 getCanvas 就是它）；
  // 换 provider 时如果拿不到 canvas，source 返回 null，玻璃层只清屏不画。
  source: () => {
    const canvas = mapElement.value?.querySelector('canvas')
    return canvas instanceof HTMLCanvasElement ? canvas : null
  },
  targets: resolveGlassTargets
})

/** 真折射跑起来了才去掉 DOM 上的 blur；否则一律走兜底。 */
const mapGlassActive = computed(() => glassEnabled.value && mapGlassReady.value && glassStrengthScale.value > 0)

function readGlassPreference(): boolean {
  try {
    return window.localStorage.getItem(MAP_GLASS_STORAGE_KEY) !== 'off'
  } catch {
    // Safari 隐私模式下 localStorage 会抛：默认开，只是记不住
    return true
  }
}

function persistGlassPreference(): void {
  try {
    window.localStorage.setItem(MAP_GLASS_STORAGE_KEY, glassEnabled.value ? 'on' : 'off')
  } catch {
    // 同上：存不住就算了，本次会话内仍然生效
  }
}

function setGlassRefraction(enabled: boolean): void {
  glassEnabled.value = enabled
}

async function syncMapGlass(): Promise<void> {
  if (!import.meta.client) return
  if (!glassEnabled.value || window.innerWidth >= 768) {
    stopMapGlass()
    return
  }
  await nextTick()
  const layer = glassLayerElement.value
  if (!layer) return
  try {
    attachMapGlass(layer)
    startMapGlass()
  } catch {
    // 有些 WebGL2 实现（软件渲染、PWA 壳、旧版 iOS）getContext 能过但缺 VAO 等入口，
    // buildPipeline 里会抛。这里兜住：撤掉半成品画布，页面继续用 .map-glass-surface 的
    // backdrop-filter，不弹错误、不影响地图交互。
    layer.replaceChildren()
    stopMapGlass()
  }
}

// fps 连续 3 个 500ms 窗口低于 40 → 强度乘 0.4；再连续 3 个 → 停渲染回退 blur。
// 不自动回升：回升会在边界来回抖，用户看到的是「一会儿有折射一会儿没有」。
watch(mapGlassFps, (value) => {
  if (!mapGlassReady.value || value <= 0) return
  if (value >= MAP_GLASS_LOW_FPS) {
    glassLowFpsSamples = 0
    return
  }
  glassLowFpsSamples += 1
  if (glassLowFpsSamples >= 6) {
    stopMapGlass()
    return
  }
  if (glassLowFpsSamples >= 3 && glassStrengthScale.value > 0.4) glassStrengthScale.value = 0.4
})

watch(glassEnabled, () => {
  persistGlassPreference()
  void syncMapGlass()
})

/** 顶部来源条文案：只报当前真的开着的图层，避免写成固定广告词。 */
function resolveMobileSourceSummary(): string {
  const parts = [activeMapProviderId.value === 'amap' ? '高德' : '参考底图']
  if (transitLinesOpen.value) parts.push('公交')
  if (speedBumpsVisible.value) parts.push('减速带 27')
  return parts.join(' · ')
}

const activeMapProviderId = ref<MapProviderId | null>(null)
const mapStatus = ref<'loading' | 'ready' | 'error'>('loading')
const mapErrorMessage = ref(MAP_LOAD_ERROR_MESSAGE)
const selectedPoiId = ref<string | null>(initialSelectedPoiId)
const selectedArea = ref<MapArea | null>(null)
const selectedNativePlace = ref<PublicMapPlace | null>(null)
const {
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
} = useMapFilter({
  places,
  activeScope,
  publishedPlacesInScope,
  ownerMapPlacesInScope,
  hasPublicPlaceError: computed(() => Boolean(publicPlaceError.value)),
  selectedPoiId,
  selectedNativePlace,
  selectedArea,
  mapProvider
})
const deepLinkAutoSelectFired = ref(false)

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
  userLocation,
  locateUser,
  startLocateDisplay,
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
let lastAutoLocatedSearchKey = ''

const {
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
} = useMapPoi({
  places,
  activeScope,
  filteredPois,
  filteredMapPois,
  nativeSearchResults,
  searchQuery,
  activeCategory,
  selectedPoiId,
  selectedNativePlace,
  selectedArea,
  mapProvider,
  mapViewMode,
  canShowOfficialPlan,
  mobileSheetState,
  sidebarCollapsed,
  copyText
})

// 地点详情面板只挂一份：variant 跟着 md 断点切换，避免同一个地点把整棵面板渲染两遍。
const PANEL_DESKTOP_MEDIA_QUERY = '(min-width: 768px)'
const panelMediaQuery: MediaQueryList | null = import.meta.client
  ? window.matchMedia(PANEL_DESKTOP_MEDIA_QUERY)
  : null
const panelIsDesktop = ref(panelMediaQuery?.matches ?? true)
function syncPanelVariant(event?: MediaQueryListEvent): void {
  panelIsDesktop.value = event ? event.matches : Boolean(panelMediaQuery?.matches)
}
onMounted(() => {
  panelMediaQuery?.addEventListener('change', syncPanelVariant)
})
onBeforeUnmount(() => {
  panelMediaQuery?.removeEventListener('change', syncPanelVariant)
})

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
    // 手机端不回到半屏：半屏会把地图压到两百多像素，楼栋全被面板盖住、点不动。
    mobileSheetState.value = window.innerWidth < 768 && decision.mobileSheetState === 'half'
      ? 'collapsed'
      : decision.mobileSheetState
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
      void nextTick(() => scrollToPoi(scrollToPoiId))
    }
    return
  }

  selectArea(apply.targetArea)
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

// 只在「从空到有」的那一次重置面板；逐字输入时不再改面板状态，否则手机端每敲一个字布局就跳一次。
let searchWasEmpty = !searchQuery.value.trim()
watch(searchQuery, (value) => {
  const nowEmpty = !value.trim()
  if (searchWasEmpty && !nowEmpty) {
    const reset = resolveSearchQueryChangeReset({ mobileSheetState: mobileSheetState.value })
    lastAutoLocatedSearchKey = reset.lastAutoLocatedSearchKey
    selectedNativePlace.value = reset.selectedNativePlace
    // 不要再顺手改 mobileSheetState：手机端一改就会重建浮层，
    // 正在输入的 input 被销毁，表现为「打一个字就被清空」。
  }
  searchWasEmpty = nowEmpty
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
  scrollToPoi
})

// 校车/校外公交图层：线路、实时车位置、减速带与底图注记的状态和逻辑都在 useMapTransit。
const {
  busSelectedRouteId,
  busPanelOpen,
  busRoutes,
  busVehicles,
  busFetchedAt,
  transitLinesOpen,
  transitPanelOpen,
  transitLoading,
  transitDirections,
  transitFetchedAt,
  transitLive,
  transitDepartures,
  transitLiveError,
  transitSelectedDirection,
  transitVehicleFocus,
  transitGpsAge,
  transitMyLocation,
  speedBumpsVisible,
  basemapLabelsVisible,
  toggleBasemapLabels,
  toggleSpeedBumps,
  toggleTransitLines,
  changeTransitLine,
  changeTransitDirection,
  distanceLabel,
  focusTransitStop,
  focusTransitVehicleFromPanel,
  closeVehicleDetails,
  startTransitLive,
  stopTransitLive
} = useMapTransit({
  mapProvider,
  userLocation,
  notify: notice => toast.add(notice)
})

// 个人定位接入校车定位：进图即静默显示「我的位置」蓝点（不飞相机）
onMounted(() => {
  if (window.innerWidth < 768) mobileSheetState.value = 'collapsed'
  if (transitLinesOpen.value) startTransitLive()
  startLocateDisplay()
  // 手机上公交列表默认收起，免得和校车浮层叠在一起
  if (window.innerWidth < 768) transitPanelOpen.value = false
  // 玻璃开关按上次的选择恢复；移动端才 attach（桌面浮层是 md:hidden，不需要这一层）
  glassEnabled.value = readGlassPreference()
  void syncMapGlass()
  // 面板高度实时回流给浮动件基线（拖动、三态过渡、窗口旋转都走这一条）
  if (typeof ResizeObserver !== 'undefined' && mobileSheetElement.value) {
    mobileSheetResizeObserver = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height ?? 0
      if (height > 0) mobileSheetLiveHeightPx.value = height
    })
    mobileSheetResizeObserver.observe(mobileSheetElement.value)
  }
})
watch(mapProvider, (provider, previous) => {
  if (provider && !previous && userLocation.value) {
    provider.setUserLocation({ point: userLocation.value })
  }
})

onBeforeUnmount(() => {
  mobileSheetResizeObserver?.disconnect()
  mobileSheetResizeObserver = null
  stopTransitLive()
  cancelMapRouteSync()
  cancelNativeSearch()
  clearWalkingRoute()
  stopMapGlass()
})

// ── P-002/impl/04：抽屉首屏 = 收藏 / 最近去过 / 分类；98 个地点列表降级为「全部地点」二级视图 ──
type MapSheetView = 'sections' | 'all'
const mapSheetView = ref<MapSheetView>('sections')
const {
  favorites,
  recent,
  isFavorite,
  toggleFavorite,
  touchRecent,
  clearRecent
} = useMapShortcuts()

const mapPlaceLookup = computed(() => new Map(places.value.map(place => [place.id, place])))
const favoritePois = computed<PublicMapPlace[]>(() => favorites.value
  .map(id => mapPlaceLookup.value.get(id))
  .filter((place): place is PublicMapPlace => Boolean(place))
  .slice(0, 6))
const recentPois = computed<PublicMapPlace[]>(() => recent.value
  .map(entry => mapPlaceLookup.value.get(entry.id))
  .filter((place): place is PublicMapPlace => Boolean(place))
  .slice(0, 8))

// 打开任意地点详情就记一条最近访问：地图点选与列表点选都收敛到 selectedPoiId 这一条状态
watch(selectedPoiId, (id) => {
  if (id) touchRecent(id)
})

const mapSheetSearching = computed(() => searchQuery.value.trim().length > 0)
const mapSheetShowsSections = computed(() => mobileSheetState.value !== 'collapsed'
  && mapSheetView.value === 'sections'
  && !mapSheetSearching.value)
const mapSheetShowsFullList = computed(() => {
  if (panelIsDesktop.value) return true
  if (mobileSheetState.value === 'collapsed') return false
  if (mapSheetSearching.value) return nativeSearchResults.value.length === 0
  return mapSheetView.value === 'all'
})

function backToMapSections(): void {
  mapSheetView.value = 'sections'
  mobileSheetState.value = 'half'
}

function focusMapSheetSection(section: 'favorites' | 'recent' | 'category'): void {
  mapSheetView.value = 'sections'
  if (mobileSheetState.value === 'collapsed') {
    mobileSheetState.value = 'half'
  }
  void nextTick(() => {
    document.getElementById('map-sheet-' + section)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  })
}

// 分类 2×3：五个主分类 + 全部地点（图标取自 map-presentation 的分类真值）
const mapSheetCategoryEntries = [
  { id: 'campus-building', label: '教学', icon: 'i-lucide-school' },
  { id: 'dorm', label: '宿舍', icon: 'i-lucide-bed-single' },
  { id: 'food', label: '食堂', icon: 'i-lucide-utensils' },
  { id: 'service', label: '服务', icon: 'i-lucide-landmark' },
  { id: 'nearby', label: '周边', icon: 'i-lucide-store' }
] as const

type MapSheetCategoryId = (typeof mapSheetCategoryEntries)[number]['id']

function openMapSheetCategory(id: MapSheetCategoryId): void {
  setCategory(id)
  mapSheetView.value = 'sections'
  mobileSheetState.value = 'half'
}
</script>

<template>
  <div
    class="map-workspace relative h-full min-h-0 overflow-hidden bg-[var(--surface)] overscroll-none md:grid md:grid-rows-1"
    :class="sidebarCollapsed ? 'md:grid-cols-1' : 'md:grid-cols-[18rem_minmax(0,1fr)]'"
    :data-glass-ready="mapGlassActive ? 'on' : 'off'"
    :data-glass-fps="mapGlassFps"
    :data-sheet-state="mobileSheetState"
    :style="{ '--map-mobile-dock': `${mobileDockBottom}px` }"
  >
    <aside
      ref="mobileSheetElement"
      class="map-glass-sheet absolute inset-x-0 bottom-0 z-30 flex min-h-0 min-w-0 flex-col rounded-t-[28px] bg-[var(--surface)] transition-[height] duration-300 ease-[cubic-bezier(0.2,0,0,1)] md:pointer-events-auto md:static md:order-1 md:h-auto md:rounded-none md:border-r md:border-t-0 md:shadow-none"
      :style="mobileSheetStyle"
      :class="[
        mobileSheetHeightClass,
        // T-022 修正 01（R-010 F14）：高度只按 CSS 断点走，不再依赖 panelIsDesktop。
        // JS 的 matchMedia 与 CSS 的 md 断点不同源时（如 CDP emulate 视口），面板会卡在 58vh 而非 326。
        mobileSheetState === 'half' ? 'max-md:!h-[326px]' : '',
        mobileSheetState === 'collapsed' ? 'max-md:!h-0 max-md:border-t-0 max-md:shadow-none' : '',
        // 真折射跑起来时不要再叠 backdrop-filter：叠了等于把已经弯折的底图再糊一遍，
        // 08-WebGL全屏折射 里「楼在玻璃里折」的观感就没了。ready=false 才回落到 blur。
        mapGlassActive ? 'map-glass-refracting' : 'map-glass-surface',
        // 折叠态也要有视觉边界：没有边框和阴影，面板会和地图糊在一起，
        // 用户看不出「这里还有一列地点、可以上滑」。
        mobileSheetState === 'collapsed'
          ? 'border-t border-[var(--line)] shadow-[0_-4px_16px_rgb(0_0_0/10%)]'
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
        class="relative flex h-14 shrink-0 touch-none cursor-ns-resize items-center justify-between gap-2 px-3 md:hidden"
        :class="mobileSheetState === 'half' ? '!h-10' : ''"
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
        <div class="flex min-w-0 flex-1 items-center gap-1 pt-3">
          <p class="truncate text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
            我的地图
          </p>
        </div>
        <!-- 三态入口收成一个文字按钮：mockup（18-地图页-真折射手机.png）里只有「收起 / 展开」；
             三个 chevron 图标在 390px 宽下把标题挤掉，用户也分不清 minus 是三态里的哪个。 -->
        <button
          type="button"
          class="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-green-700 active:bg-green-50 dark:text-green-400 dark:active:bg-green-950"
          :aria-label="mobileSheetState === 'collapsed' ? '展开地点面板' : '收起地点面板'"
          :aria-pressed="mobileSheetState !== 'collapsed'"
          @click="() => { mobileSheetState = mobileSheetState === 'collapsed' ? 'half' : 'collapsed' }"
        >
          {{ mobileSheetState === 'collapsed' ? '展开' : '收起' }}
        </button>
      </div>


      <div
        v-if="mobileSheetState === 'collapsed'"
        class="grid min-h-0 flex-1 place-items-center px-3 text-[11px] text-zinc-400 dark:text-zinc-500 md:hidden"
        aria-hidden="true"
      >
        上滑展开 · 收藏 / 最近 / 分类
      </div>

      <div
        class="hidden shrink-0 border-b border-[var(--line)] px-3 py-2 md:block md:px-5 md:py-4"
      >
        <!-- 桌面端的搜索框与分类栏留在侧栏里（现状不变）；移动端这两块搬到顶部浮层，见下方 md:hidden 的浮层。 -->
        <div class="hidden md:block">
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
                class="justify-center hidden size-11 md:inline-flex"
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
          <!-- 清空按钮不能按需挂载：第一个字出现时插槽一变，UInput 会把内部 input 重建，
               手机端焦点和值一起丢，表现就是「打一个字母就被清空」。这里常驻、只切可见性。 -->
          <template #trailing>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              :class="searchQuery ? '' : 'pointer-events-none opacity-0'"
              :aria-hidden="searchQuery ? undefined : 'true'"
              :tabindex="searchQuery ? undefined : -1"
              aria-label="清空搜索"
              @click="clearSearchQuery"
            />
          </template>
        </UInput>

        <div
          class="mt-2 grid grid-cols-4 gap-1 md:mt-3 md:flex md:overflow-x-auto md:pb-1"
          :class="mobileSheetState === 'collapsed' ? 'hidden md:flex' : ''"
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
        </div>

        <p
          v-if="mapFallbackMessage"
          class="map-sheet-hint mt-2 text-xs leading-5 text-blue-800"
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
        v-if="mapSheetShowsSections"
        class="scrollbar-none min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-3 pt-0 md:hidden"
        aria-label="收藏、最近去过与分类"
      >
        <section
          id="map-sheet-category"
          class="mt-0.5"
          aria-labelledby="map-sheet-category-title"
        >
        <div class="mt-0.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            class="flex h-[74px] flex-col justify-between rounded-[18px] border border-white/70 bg-[color-mix(in_srgb,var(--surface)_50%,transparent)] px-3.5 py-3 text-left active:bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] dark:border-white/10 dark:bg-[color-mix(in_srgb,var(--surface)_5%,transparent)]"
            aria-label="打开收藏列表"
            @click="focusMapSheetSection('favorites')"
          >
            <span class="flex items-center gap-1.5 text-[12.5px] text-zinc-500 dark:text-zinc-400">
              <UIcon
                name="i-lucide-star"
                class="size-3.5"
              />
              收藏
            </span>
            <span class="text-[22px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{{ favorites.length }}<small class="ml-1 text-[11px] font-normal text-zinc-400">个地点</small></span>
          </button>
          <button
            type="button"
            class="flex h-[74px] flex-col justify-between rounded-[18px] border border-white/70 bg-[color-mix(in_srgb,var(--surface)_50%,transparent)] px-3.5 py-3 text-left active:bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] dark:border-white/10 dark:bg-[color-mix(in_srgb,var(--surface)_5%,transparent)]"
            aria-label="打开最近去过列表"
            @click="focusMapSheetSection('recent')"
          >
            <span class="flex items-center gap-1.5 text-[12.5px] text-zinc-500 dark:text-zinc-400">
              <UIcon
                name="i-lucide-history"
                class="size-3.5"
              />
              最近
            </span>
            <span class="text-[22px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{{ recent.length }}<small class="ml-1 text-[11px] font-normal text-zinc-400">个地点</small></span>
          </button>
        
        </div>
        <div class="map-sheet-categories mt-0.5 grid grid-cols-3 gap-1 pb-2">
            <button
              v-for="entry in mapSheetCategoryEntries"
              :key="entry.id"
              type="button"
            class="flex h-[62px] flex-col items-center justify-center gap-1 rounded-[18px] border border-white/70 bg-[color-mix(in_srgb,var(--surface)_50%,transparent)] px-1 text-center text-[12.5px] font-medium text-zinc-800 active:bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] dark:border-white/10 dark:bg-[color-mix(in_srgb,var(--surface)_5%,transparent)] dark:text-zinc-100"
              :aria-label="'筛选分类 ' + entry.label"
              @click="openMapSheetCategory(entry.id)"
            >
              <UIcon
                :name="entry.icon"
                class="size-4 shrink-0 text-zinc-500 dark:text-zinc-400"
              />
              {{ entry.label }}
            </button>
        </div>
        </section>
        <section
          id="map-sheet-favorites"
          aria-labelledby="map-sheet-favorites-title"
        >
          <div class="flex items-center justify-between">
            <h2
              id="map-sheet-favorites-title"
              class="text-[13px] font-medium text-zinc-500 dark:text-zinc-400"
            >
              收藏
            </h2>
            <span class="text-[11px] text-zinc-400 dark:text-zinc-500">{{ favorites.length }} 个</span>
          </div>
          <p
            v-if="favoritePois.length === 0"
            class="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400"
          >
            还没有收藏 · 在地点详情点 ★ 收藏
          </p>
          <ul
            v-else
            class="mt-2 grid grid-cols-2 gap-1.5"
          >
            <li
              v-for="poi in favoritePois"
              :key="poi.id"
            >
              <button
                type="button"
                class="flex min-h-11 w-full items-center gap-2 rounded-md border border-[var(--line)] px-2 text-left active:bg-zinc-50 dark:active:bg-zinc-800"
                :aria-label="'打开收藏地点 ' + poi.name"
                @click="selectPoi(poi)"
              >
                <UIcon
                  :name="categoryIcon(poi.category)"
                  class="size-4 shrink-0 text-zinc-500 dark:text-zinc-400"
                />
                <span class="min-w-0 truncate text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{{ poi.name }}</span>
              </button>
            </li>
          </ul>
        </section>

        <section
          id="map-sheet-recent"
          class="mt-4"
          aria-labelledby="map-sheet-recent-title"
        >
          <div class="flex items-center justify-between">
            <h2
              id="map-sheet-recent-title"
              class="text-[13px] font-medium text-zinc-500 dark:text-zinc-400"
            >
              最近去过
            </h2>
            <button
              v-if="recentPois.length > 0"
              type="button"
              class="rounded-md px-1.5 py-1 text-[11px] text-zinc-400 active:bg-zinc-100 dark:text-zinc-500 dark:active:bg-zinc-800"
              aria-label="清空最近去过"
              @click="clearRecent"
            >
              清空
            </button>
          </div>
          <p
            v-if="recentPois.length === 0"
            class="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400"
          >
            还没有记录 · 打开任意地点就会出现在这里
          </p>
          <ul
            v-else
            class="mt-2 space-y-1"
          >
            <li
              v-for="poi in recentPois"
              :key="poi.id"
            >
              <button
                type="button"
                class="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left active:bg-zinc-50 dark:active:bg-zinc-800"
                :aria-label="'打开最近地点 ' + poi.name"
                @click="selectPoi(poi)"
              >
                <UIcon
                  :name="categoryIcon(poi.category)"
                  class="size-4 shrink-0 text-zinc-500 dark:text-zinc-400"
                />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{{ poi.name }}</span>
                  <span class="block truncate text-[11px] text-zinc-500 dark:text-zinc-400">{{ categoryLabel(poi.category) }}</span>
                </span>
              </button>
            </li>
          </ul>
        </section>

        
      </div>

      <div
        class="hidden items-center justify-between border-b border-[var(--line)] px-3 py-1 text-xs text-zinc-500 dark:text-zinc-400 md:flex md:px-5 md:py-2"
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
        v-show="mapSheetShowsFullList && mapSheetView === 'all' && !mapSheetSearching"
        class="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-3 py-1 md:hidden"
      >
        <button
          type="button"
          class="inline-flex min-h-11 items-center gap-1 rounded-md pr-2 text-[13px] font-medium text-green-700 active:bg-green-50 dark:text-green-400 dark:active:bg-green-950"
          aria-label="返回收藏、最近去过与分类"
          @click="backToMapSections"
        >
          <UIcon
            name="i-lucide-chevron-left"
            class="size-4"
          />
          返回
        </button>
        <span class="text-[13px] text-zinc-500 dark:text-zinc-400">{{ filteredPois.length }} 个地点</span>
      </div>

      <div
        v-show="mapSheetShowsFullList"
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
          :class="selectedPoiId === poi.id ? 'bg-green-50 dark:bg-green-950' : 'bg-[var(--surface)] dark:bg-zinc-900'"
          @click="selectPoi(poi)"
        >
          <span
            class="grid size-8 shrink-0 place-items-center rounded-md md:size-9"
            :class="selectedPoiId === poi.id ? 'bg-green-700 text-[var(--surface)]' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'"
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
      <!-- 玻璃折射画布：由 useMapGlassRefraction.attach() 在这里建 canvas。
           必须在地图之上、所有浮层之下（z-18）；浮层自己只留白纱，弯折的底图由这一层画。 -->
      <div
        ref="glassLayerElement"
        class="pointer-events-none absolute inset-0 z-[18] md:hidden"
        aria-hidden="true"
      />

      <!-- 移动端浮层（<768px）：搜索胶囊 / 分类 chips / 底图来源条 / 右侧定位与列表。
           桌面端整块 md:hidden，侧栏保持原样。 -->
      <div
        class="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 px-[10px] pt-[calc(env(safe-area-inset-top)+8px)] md:hidden"
      >

        <div
          ref="glassChipsElement"
          v-show="mobileSheetState === 'collapsed'"
          class="map-glass-shell pointer-events-auto grid w-full grid-flow-col auto-cols-[calc((100%_-_28px)/5)] grid-rows-1 gap-[7px] overflow-x-auto overscroll-x-contain rounded-[17px] p-1"
          :class="mapGlassActive ? 'map-glass-refracting' : 'map-glass-surface'"
          aria-label="地点分类"
        >
          <button
            v-for="category in categories"
            :key="category.id"
            type="button"
          class="flex h-[34px] min-h-0 shrink-0 items-center justify-center gap-1 rounded-[17px] px-0 text-[13px] font-medium transition-colors"
            :class="activeCategory === category.id
              ? 'bg-[var(--ink)] text-[var(--surface)]'
              : 'text-zinc-700 dark:text-zinc-200'"
            :aria-pressed="activeCategory === category.id"
            @click="setCategory(category.id)"
          >
            <span
              v-if="activeCategory === category.id"
              class="size-1.5 shrink-0 rounded-full bg-[color-mix(in_srgb,var(--surface)_90%,transparent)]"
              aria-hidden="true"
            />
            {{ category.label }}
          </button>
        </div>

        <div
          ref="glassSourceElement"
          class="map-glass-shell pointer-events-auto flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-zinc-700 dark:text-zinc-200"
          :class="mapGlassActive ? 'map-glass-refracting' : 'map-glass-surface'"
        >
          <span
            class="size-1.5 shrink-0 rounded-full bg-green-600 dark:bg-green-400"
            aria-hidden="true"
          />
          {{ resolveMobileSourceSummary() }}
        </div>
      </div>

      <!-- 移动端右侧竖排：定位（实心）+ 地点列表（玻璃）。
           取代原来那排 7 个工具按钮：mockup 上只有这两个入口，其余按钮移动端整排收起。 -->
      <div class="map-mobile-rail pointer-events-none absolute inset-y-0 right-3 z-20 flex flex-col justify-center gap-2 md:hidden">
        <div ref="glassLocateElement" class="pointer-events-none">
        <UButton
          :icon="tracking ? 'i-lucide-locate-fixed' : 'i-lucide-locate'"
          color="primary"
          variant="solid"
          :loading="locating"
          class="pointer-events-auto size-12 justify-center rounded-[17px] shadow-lg"
          :aria-label="tracking ? '停止实时定位' : '开启实时定位'"
          :aria-pressed="tracking"
          @click="tracking ? toggleTracking() : locateUser()"
        />
        </div>
      </div>


      <!-- 底部整块：搜索胶囊贴底栏上沿，和 tabbar 同底色，中间不露地图 -->
      <div
        v-show="mobileSheetState === 'collapsed'"
        class="pointer-events-none absolute inset-x-0 bottom-0 z-30 md:hidden"
      >
        <div class="pointer-events-auto px-3 pb-[22px] pt-2.5">
          <div
            ref="glassSearchElement"
            class="map-glass-shell flex h-[54px] items-center gap-2 rounded-full pl-4 pr-2"
            :class="mapGlassActive ? 'map-glass-refracting' : 'map-glass-surface'"
          >
            <UIcon
              name="i-lucide-search"
              class="size-[18px] shrink-0 text-zinc-500 dark:text-zinc-400"
            />
            <input
              :value="searchQuery"
              type="search"
              enterkeyhint="search"
              class="min-w-0 flex-1 appearance-none bg-transparent text-[15px] text-zinc-900 outline-none placeholder:text-zinc-500 dark:text-zinc-100 dark:placeholder:text-zinc-400"
              placeholder="搜索地点或附近商家"
              aria-label="搜索地图地点"
              @input="onSearchQueryInput(($event.target as HTMLInputElement).value)"
              @compositionstart="onSearchCompositionStart"
              @compositionend="onSearchCompositionEnd"
            >
            <UButton
              v-show="searchQuery"
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              class="shrink-0 rounded-full"
              aria-label="清空搜索"
              @click="clearSearchQuery"
            />
            <button
              type="button"
              class="grid size-[38px] shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--surface)_55%,transparent)] text-zinc-600 active:bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] dark:bg-[color-mix(in_srgb,var(--surface)_10%,transparent)] dark:text-zinc-200"
              aria-label="拉起点位面板"
              @click="() => { mobileSheetState = 'half' }"
            >
              <UIcon
                name="i-lucide-chevron-up"
                class="size-4"
              />
            </button>
          </div>
        </div>
        <PublicPageViewStats
          variant="map-dock"
          class="map-view-stats-mini"
        />
      </div>

      <MapOfficialCampusPlan
        v-if="canShowOfficialPlan && mapViewMode === 'official-plan'"
        :selected-map-number="selectedOfficialPlanNumber(selectedPoi)"
        :selected-reference-label="selectedPoi?.referenceLabel"
        :selected-place-name="selectedPoi?.name"
        @select-number="selectOfficialPlanNumber"
      />

      <!-- 徽章区：移动端左上角竖排不动；桌面端右下角，flex-col-reverse 使「长在下短在上」、底部对齐 -->
      <!-- 移动端不再显示这排徽章：新浮层里的「来源条」已经报了同样三条信息（高德 / 公交 / 减速带），
           两处并存会在 390px 宽度下压住搜索胶囊（实测徽章 top=12 与搜索框 top=61 重叠）。
           桌面端位置与内容保持原样。 -->
      <div class="pointer-events-none absolute inset-x-3 top-3 z-20 hidden flex-col items-start md:inset-x-auto md:right-4 md:top-auto md:bottom-14 md:flex md:items-end">
        <div class="map-provider-badges flex flex-col items-start gap-1.5 md:flex-col-reverse md:items-end">
          <!-- 桌面端 DOM 顺序按实测宽度从长到短排列：reverse 后视觉上短在上、长在下 -->
          <div
            v-if="mapViewMode === 'geographic' && transitLinesOpen"
            class="app-bar pointer-events-auto flex items-center gap-2.5 rounded-md border border-zinc-200/90 px-2.5 py-1.5 text-xs font-medium text-zinc-700 shadow-sm dark:border-zinc-700 dark:text-zinc-200"
          >
            <span class="flex items-center gap-1">
              <i class="size-2 rounded-full bg-[#1a6cf5]" />
              K2
            </span>
            <span class="flex items-center gap-1">
              <i class="size-2 rounded-full bg-[#e8590c]" />
              K6
            </span>
            <span class="text-zinc-500 dark:text-zinc-400">校外公交</span>
          </div>
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
                : '校园范围参考底图' }}
          </UBadge>
          <UBadge
            v-if="mapViewMode === 'geographic' && activeMapProviderId !== 'amap'"
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
          <div
            v-if="mapViewMode === 'geographic' && speedBumpsVisible"
            class="app-bar pointer-events-auto flex items-center gap-1.5 rounded-md border border-zinc-200/90 px-2.5 py-1.5 text-xs font-medium text-zinc-700 shadow-sm dark:border-zinc-700 dark:text-zinc-200"
          >
            <i class="h-2.5 w-4 rounded-sm border border-zinc-500 bg-[repeating-linear-gradient(135deg,#facc15_0_3px,#18181b_3px_6px)]" />
            减速带 27
          </div>
        </div>
      </div>

      <!-- 展开地点栏：侧栏收起后桌面的唯一入口，固定在左上角（不放右下角徽章堆里） -->
      <div class="pointer-events-none absolute left-3 top-3 z-20 hidden md:left-4 md:top-4 md:block">
        <UTooltip
          v-if="sidebarCollapsed"
          text="展开地点栏"
        >
          <UButton
            icon="i-lucide-panel-left-open"
            color="neutral"
            variant="solid"
            class="justify-center pointer-events-auto size-11 shadow-sm"
            aria-label="展开地点栏"
            @click="() => { sidebarCollapsed = false }"
          />
        </UTooltip>
      </div>

      <!-- 视图切换 + 右侧工具栏：保持在顶部一行（工具栏靠右） -->
      <div class="pointer-events-none absolute inset-x-3 top-3 z-20 flex items-start justify-end gap-3 md:inset-x-4 md:top-4">
        <div
          v-if="canShowOfficialPlan"
          class="pointer-events-auto absolute left-1/2 top-0 flex -translate-x-1/2 overflow-hidden rounded-md border border-white/40 bg-[var(--surface)] shadow-sm"
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
          class="app-bar pointer-events-auto flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden rounded-xl border border-zinc-200/90 shadow-lg hidden md:flex"
        >
          <UTooltip :text="transitLinesOpen ? '隐藏 K2 / K6 校外公交线路' : '显示 K2 / K6 校外公交线路'">
            <UButton
              icon="i-lucide-bus-front"
              color="neutral"
              variant="ghost"
              :loading="transitLoading"
              class="justify-center map-control-btn size-10 rounded-none md:size-11"
              :class="transitLinesOpen ? 'bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-300' : ''"
              aria-label="显示 K2 / K6 校外公交线路"
              :aria-pressed="transitLinesOpen"
              @click="toggleTransitLines"
            />
          </UTooltip>
          <UTooltip :text="speedBumpsVisible ? '隐藏校园减速带（27 处）' : '显示校园减速带（27 处）'">
            <UButton
              icon="i-lucide-triangle-alert"
              color="neutral"
              variant="ghost"
              class="justify-center map-control-btn size-10 rounded-none md:size-11"
              :class="speedBumpsVisible ? 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300' : ''"
              aria-label="显示校园减速带"
              :aria-pressed="speedBumpsVisible"
              @click="toggleSpeedBumps"
            />
          </UTooltip>
          <UTooltip :text="basemapLabelsVisible ? '底图注记：全部显示（含校内）' : '底图注记：只显示校外'">
            <UButton
              icon="i-lucide-type"
              color="neutral"
              variant="ghost"
              class="justify-center map-control-btn size-10 rounded-none md:size-11"
              :class="basemapLabelsVisible ? 'bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300' : ''"
              aria-label="切换底图注记显示范围"
              :aria-pressed="basemapLabelsVisible"
              @click="toggleBasemapLabels"
            />
          </UTooltip>
          <UTooltip text="地图显示设置">
            <UButton
              icon="i-lucide-layers-3"
              color="neutral"
              variant="ghost"
              class="justify-center map-control-btn size-10 rounded-none md:size-11"
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
              class="justify-center map-control-btn size-10 rounded-none md:size-11"
              aria-label="显示全部地点"
              @click="fitToVisiblePois"
            />
          </UTooltip>
          <UTooltip :text="tracking ? '停止实时定位' : '开启实时定位'">
            <UButton
              :icon="tracking ? 'i-lucide-locate-fixed' : 'i-lucide-locate'"
              color="neutral"
              variant="ghost"
              :loading="locating"
              class="justify-center map-control-btn size-10 rounded-none md:size-11"
              :class="tracking ? 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300' : ''"
              :aria-label="tracking ? '停止实时定位' : '开启实时定位'"
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
              class="justify-center map-control-btn size-10 rounded-none md:size-11"
              :class="following ? 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300' : ''"
              aria-label="相机跟随我的位置"
              :aria-pressed="following"
              @click="toggleFollowing"
            />
          </UTooltip>
        </div>
      </div>


      <MapDisplaySettingsPanel
        v-if="mapViewMode === 'geographic' && displaySettingsOpen"
        :base-style="mapBaseStyle"
        :display-options="mapDisplayOptions"
        :glass-refraction="glassEnabled"
        @close="displaySettingsOpen = false"
        @set-base-style="setMapBaseStyle"
        @toggle-option="toggleDisplayOption"
        @set-label-size="setLabelSize"
        @set-glass-refraction="setGlassRefraction"
      />

      <div
        v-if="mapViewMode === 'geographic' && routeSummary"
        class="app-bar absolute left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-md border border-green-200 dark:border-green-800 px-4 py-3 shadow-lg md:bottom-14"
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
        </template>
      </UModal>

      <!-- 路口级步行指引（点路线条展开） -->
      <div
        v-if="mapViewMode === 'geographic' && routeSummary && routeStepsOpen && routeSteps.length"
        class="app-bar absolute left-1/2 z-20 w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden rounded-md border border-green-200 dark:border-green-800 shadow-lg md:bottom-14"
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
          class="app-bar pointer-events-auto max-w-sm rounded-lg border border-zinc-200 dark:border-zinc-800 p-5 shadow-lg"
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
        <div class="app-bar max-w-sm border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-center shadow-sm">
          <UIcon
            name="i-lucide-map-pin-off"
            class="mx-auto size-5 text-zinc-500 dark:text-zinc-400"
          />
          <p class="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            当前地图还没有可直接显示的地点
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
        class="absolute left-3 z-30 w-[min(22rem,calc(100%-1.5rem))] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] p-4 shadow-xl md:bottom-12 md:left-4"
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
      </section>

      <MapPlaceDetailsPanel
        v-if="selectedPoi"
        :variant="panelIsDesktop ? 'desktop' : 'mobile'"
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
        :favorite="isFavorite(selectedPoi.id)"
        @close="clearPoi"
        @toggle-favorite="toggleFavorite(selectedPoi.id)"
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
      :left-offset="sidebarCollapsed ? '1rem' : '19rem'"
      :user-location="userLocation"
      @select-route="busSelectedRouteId = $event"
    />

    <!-- 校外公交面板：K2/K6 方向可展开看站序 -->

    <!-- 车辆详情：点车后镜头跟住它，这里显示下一站与 GPS 新鲜度 -->
    <div
      v-if="transitVehicleFocus"
      class="app-bar pointer-events-auto fixed bottom-20 right-3 z-50 w-60 rounded-xl border border-zinc-200 p-3 shadow-lg md:bottom-6 md:right-6 dark:border-zinc-700"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            {{ transitVehicleFocus.plate }}
          </p>
          <p class="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">
            <span
              v-if="transitVehicleFocus.routeName"
              class="mr-1 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            >
              {{ transitVehicleFocus.routeName }}
            </span>
            下一站 {{ transitVehicleFocus.nextStation || '在途' }}
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
          aria-label="关闭车辆详情"
          @click="closeVehicleDetails"
        >
          <UIcon
            name="i-lucide-x"
            class="size-4"
          />
        </button>
      </div>
      <dl class="mt-2 space-y-1 text-[11px] text-zinc-600 dark:text-zinc-300">
        <div class="flex items-center justify-between gap-2">
          <dt class="text-zinc-400">
            距下一站
          </dt>
          <dd class="tabular-nums font-medium">
            {{ distanceLabel(transitVehicleFocus.distanceToNext) }}
          </dd>
        </div>
        <div class="flex items-center justify-between gap-2">
          <dt class="text-zinc-400">
            GPS 更新
          </dt>
          <dd
            class="tabular-nums font-medium"
            :class="transitGpsAge > 40 ? 'text-amber-600' : 'text-emerald-600'"
          >
            {{ transitGpsAge }} 秒前
          </dd>
        </div>
      </dl>

      <!-- 车上留言（按车号分区）：只给校内校车，校外公交是线路无稳定车号 -->
      <MapBusMomentsSection
        v-if="transitVehicleFocus.source === 'campus'"
        :bus-name="transitVehicleFocus.plate"
        :route-name="transitVehicleFocus.routeName ?? ''"
      />
    </div>
    <MapTransitPanel
      v-if="transitLinesOpen"
      v-model:open="transitPanelOpen"
      :directions="transitDirections"
      :fetched-at="transitFetchedAt"
      :live="transitLive"
      :departures="transitDepartures"
      :live-error="transitLiveError"
      :selected-direction="transitSelectedDirection"
      :location="transitMyLocation"
      :left-offset="sidebarCollapsed ? '1rem' : '19rem'"
      @focus-stop="focusTransitStop"
      @focus-vehicle="focusTransitVehicleFromPanel"
      @select-direction="changeTransitDirection"
      @change-line="changeTransitLine"
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

/*
 * 缩放/指南针控件（.map-zoom-dock，挂 top-right）。
 * 桌面端下移到右侧工具栏正下方：工具栏 top-4(16px) 起、7×44px + 6×1px ≈ 310px，
 * 21rem(336px) = 16 + 310 + 10px 间隙；margin-right 1rem 让右边缘与工具栏对齐。
 * 移动端同样下移到工具栏正下方（右边缘对齐，button 收到 40×40 与工具栏一致）：
 * margin-top 相对 .maplibregl-ctrl-top-right（该容器内缩到地图顶边，实测 top=49px），
 * 与视口坐标差一个地图顶边，所以用实测算式
 *   工具栏 bottom(343) − ctrl 容器 top(49) + 8px 间隙 = 302px = 18.875rem
 * （390×844 下工具栏 282px 高 = 7×40px button + 2px 容器边框，分隔线是
 *  border-box 内含的 1px 不额外占高；工具栏自 top-3 起于 61、止于 343）。
 * 顶栏高度从 65 改到 49 后（P-009），工具栏与 ctrl 容器同步上移 16px，两者差值不变，
 * 所以上面的 302px 仍然成立。
 * margin-right 0.75rem 与工具栏右边缘（right-3 = 12px）对齐。
 */
.map-workspace .maplibregl-ctrl-top-right .map-zoom-dock {
  margin-top: 21rem;
  margin-right: 1rem;
}

@media (max-width: 767px) {
  /*
   * 窄屏：工具栏占着右上角，控件挪到它正下方并右边缘对齐。
   * 18.875rem(302px) = 工具栏 bottom(343) − ctrl 容器 top(49) + 8px 间隙。
   * ⚠️ 该值耦合了「移动端工具栏 = 7 个 40px 按钮 + 2px 边框」这一事实：
   * 工具栏按钮增减、或 .maplibregl-ctrl button 的移动端 40px 再调整，
   * 都需要重新量算这个 margin-top，否则控件会静默错位。
   */
  .map-workspace .maplibregl-ctrl-top-right .map-zoom-dock {
    margin-top: 18.875rem;
    margin-right: 0.75rem;
  }

  /* 覆盖后面 44px 的全局规则，与移动端工具栏 button（size-10）一致。 */
  .map-workspace .maplibregl-ctrl-top-right .map-zoom-dock button {
    width: 40px;
    height: 40px;
  }
}

/*
 * 宽 ≥768 但视口矮：桌面规则把 dock 顶边推到 409、底边 541，
 * 视口高 < 541 时会被地图 overflow 裁掉，844×390 下 visibleRatio 实测为 0。
 * 退回「贴右上、靠工具栏左侧」：桌面工具栏 right-4(16px) + 宽 46px → 左边缘 W−62，
 * 留 8px 间隙 → dock 右边缘 W−70 → margin-right 4.375rem。
 * 34.375rem(550px) 的由来：桌面 dock 底边 541 + 9px 余量，且不会误伤 1366×768 这类桌面。
 * 与下面的窄屏兜底块媒体条件互斥（min-width 768 vs max-width 767），互不覆盖。
 */
@media (min-width: 768px) and (max-height: 34.375rem) {
  .map-workspace .maplibregl-ctrl-top-right .map-zoom-dock {
    margin-top: 0.75rem;
    margin-right: 4.375rem;
  }
}

/*
 * 窄屏且极矮（≤559px 高）：工具栏占着右上角，302px 的下移量会把 dock 底边
 * 固定到 487，宽 <768 时地图底边 = 视口高 − 73，所以视口 <560 就开始裁切
 * （500px 高时 visibleRatio 只有 0.500）。此时同样退回「贴右上、靠工具栏左侧」。
 * 断点取 34.9375rem(559px) 而不是 480px：481–559 这条裁切带需要兜底；
 * 而 560px 恰好是「dock 底边 487 = 地图底边 487」的临界点，完全可见（ratio 1.000），
 * 所以 560 必须走正常规则。若写成 35rem(560px)，因 max-height 是闭区间，
 * 390×560 会被误判进兜底分支、位置退到 294,77，与验收表期望的 338,367 不符。
 * margin-right 3.5rem(56px) 按窄屏工具栏 right-3(12) + 宽 42 + 2px 间隙算。
 * 工具栏本身的收纳是另一个问题，不在这里处理。
 */
@media (max-width: 767px) and (max-height: 34.9375rem) {
  .map-workspace .maplibregl-ctrl-top-right .map-zoom-dock {
    margin-top: 0.75rem;
    margin-right: 3.5rem;
  }
}

/*
 * 版权条与比例尺现在都在左下角容器里：竖排（版权在上、比例尺在下）。
 * 版权条留在右下角会与「N 人看过」统计重叠（实测 168×20）。
 */
.map-workspace .maplibregl-ctrl-attrib {
  margin: 0;
}

.map-workspace .maplibregl-ctrl-bottom-left {
  display: flex;
  flex-direction: column-reverse;
  align-items: flex-start;
  gap: 4px;
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
  outline: 2px solid var(--color-green-600);
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
  background: var(--surface) !important;
  background-color: var(--surface) !important;
  color: var(--ink) !important;
  border: 1px solid var(--line) !important;
  box-shadow: 0 2px 12px rgb(0 0 0 / 18%) !important;
  --ui-bg: var(--surface);
  --ui-text: var(--ink);
  --ui-border: var(--line);
}

.map-workspace :deep(.map-float-btn:hover),
.map-workspace :deep(button.map-float-btn:hover) {
  background: var(--surface-sunken) !important;
  background-color: var(--surface-sunken) !important;
}

.map-workspace :deep(.map-float-btn:disabled),
.map-workspace :deep(button.map-float-btn:disabled) {
  background: var(--surface) !important;
  opacity: 0.75;
}

.map-workspace :deep(.map-control-btn),
.map-workspace :deep(button.map-control-btn) {
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  color: var(--ink) !important;
}

.map-workspace :deep(.map-control-btn:hover),
.map-workspace :deep(button.map-control-btn:hover) {
  background: var(--surface-sunken) !important;
}

.map-workspace :deep(.map-control-btn:focus-visible),
.map-workspace :deep(button.map-control-btn:focus-visible) {
  position: relative;
  z-index: 1;
  outline: 2px solid var(--color-green-600);
  outline-offset: -2px;
}

.map-workspace :deep(.map-float-btn .iconify),
.map-workspace :deep(.map-float-btn svg),
.map-workspace :deep(.map-float-btn [class*="i-lucide"]) {
  color: var(--ink) !important;
  opacity: 1 !important;
}

/* At 320px the provider badge and centered view switch share the same row. */
@media (max-width: 359px) {
  .map-workspace .map-provider-badges {
    padding-top: 3.25rem;
  }
}

/*
 * 移动端玻璃浮层（T-018）
 * 真折射由 useMapGlassRefraction 的 WebGL 层画（挂在地图 section 内、z-18），
 * DOM 这层只留一层白纱，所以 .map-glass-refracting 时不再叠 backdrop-filter ——
 * 叠了等于把弯折过的底图又糊一遍，08-WebGL全屏折射 那种「楼在玻璃里折」的观感就没了。
 * WebGL2 缺失 / 上下文丢失 / 用户关掉开关 → ready=false → 换回 .map-glass-surface。
 * 选择器都带 .map-workspace 前缀：这段 style 没有 scoped（原有的 .maplibregl-* 规则
 * 必须作用到 maplibre 自己建的 DOM），所以靠前缀把影响面锁在地图页。
 */
@media (max-width: 767px) {
  .map-workspace .map-glass-shell {
    border: 1px solid color-mix(in srgb, var(--line) 72%, transparent);
    box-shadow: 0 6px 20px rgb(0 0 0 / 12%);
  }

  .map-workspace .map-glass-surface {
    background: color-mix(in srgb, var(--surface) 62%, transparent);
    backdrop-filter: blur(12px) saturate(1.15);
  }

  /* 分类条要横向滑动，但原生滚动条会压在玻璃下沿，看着像多出一条亮带。
     改成隐藏滚动条 + 右端自然截断（第 6 个只露一半），滑动提示交给内容本身。 */
  .map-workspace .map-glass-shell[aria-label='地点分类'] {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .map-workspace .map-glass-shell[aria-label='地点分类']::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  .map-workspace .map-glass-refracting {
    background: color-mix(in srgb, var(--surface) 44%, transparent);
    backdrop-filter: none;
  }

  /* 底栏搜索框浮在地图上，占位文字要压得住底图（暗色尤其） */
  .map-workspace input[aria-label='搜索地图地点']::placeholder {
    color: color-mix(in srgb, var(--muted-ink) 82%, transparent);
  }

  /* T-023：面板重新成为折射 target（见 resolveGlassTargets）。
     折射不可用（WebGL 缺 VAO / 用户关掉玻璃）时回落到这条：90% 白纱 + blur(16px)。
     T-020 曾把两态并成同一条 90%，理由是折射态下 header 背后楼栋标注顶穿可读性不达标；
     这次把折射态白纱降到 72% + blur(2px)，靠「白纱 + 极轻模糊」换回可读性（P-004 实测纯透明亮度众数 250 → 139，纯透明不可取）。 */
  .map-workspace .map-glass-sheet {
    background: color-mix(in srgb, var(--surface) 90%, transparent);
    backdrop-filter: blur(16px) saturate(1.1);
  }

  /* T-023：面板重新成为折射 target，白纱降到 72%、blur 收到 2px，让弯折的底图色带透出来。
     72% 是 390×844 半屏态 13px 标签可读性实测值（72%–82% 区间取偏透一端）。 */
  .map-workspace .map-glass-sheet.map-glass-refracting {
    background: color-mix(in srgb, var(--surface) 72%, transparent);
    backdrop-filter: blur(2px) saturate(1.05);
  }

  /*
   * T-019：面板上沿之上的浮动带。--map-mobile-dock 由页面按面板实测高度写进根节点（152+12=164 起）。
   * 三件（校车胶囊 / 浏览数 / 高德 attribution）共用同一条基线，确保零重叠：
   *   1 档 = 基线（浏览数靠左、校车胶囊靠右）
   *   2 档 = 基线上方 38px（高德 logo + 版权，抬出面板，避免被 72% 白纱压住）
   */
  .map-workspace .map-mobile-dock {
    position: absolute;
    left: 0.75rem;
    z-index: 20;
    bottom: var(--map-mobile-dock, 10.25rem);
  }

  /* 组件根自己是 absolute bottom-3 right-3，这里让它在包装层里静态排版；
     max-width 也要放开：它的 max-w-[calc(100%-7rem)] 原本按地图区宽度算，
     进了包装层会按包装层宽度再减 112px，把胶囊压成 70px、文字溢出。 */
  .map-workspace .map-mobile-dock > * {
    position: static;
    max-width: none;
  }

  .map-workspace .amap-logo {
    bottom: 3px;
    z-index: 40;
    opacity: 0.4;
    pointer-events: none;
  }

  .map-workspace .amap-copyright {
    bottom: 6px;
    z-index: 40;
    font-size: 9px;
    line-height: 1.2;
    opacity: 0.4;
    pointer-events: none;
    background: transparent;
  }

  /* 校车胶囊（MapBusRoutePanel 折叠触发器）跟着同一条基线走 */
  .map-workspace .map-bus-dock {
    bottom: var(--map-mobile-dock, 10.25rem);
  }

  /* impl/05：折叠态面板收起，底栏搜索块占住底部，校车浮标上移让位 */
  .map-workspace[data-sheet-state='collapsed'] .map-mobile-dock {
    bottom: calc(var(--map-mobile-dock, 0px) + 87px);
  }

  .map-workspace[data-sheet-state='collapsed'] .map-bus-dock {
    bottom: calc(var(--map-mobile-dock, 0px) + 87px);
  }

  /* 搜索胶囊右侧的玻璃方块：与胶囊同色系，不再是白圆片 */
  .map-workspace .map-glass-square {
    background: color-mix(in srgb, var(--surface) 62%, transparent);
  }

  .map-workspace .map-glass-square:hover {
    background: color-mix(in srgb, var(--surface) 78%, transparent);
  }

  /* 面板展开（上沿已顶到搜索胶囊）时，浮动带没有空间，整条收起，避免穿模 */
  .map-workspace[data-sheet-state='expanded'] .map-mobile-dock,
  .map-workspace[data-sheet-state='expanded'] .map-bus-dock {
    display: none;
  }

  /* 「可查找 76 个地点和 8 个区域」在移动端整条收起：折叠态已有一行
     「上滑展开 · 收藏 / 最近 / 分类」做入口提示，两行并列会顶出 152px 的折叠高度、
     压在底栏上；半屏 / 展开态它又占一行把 header 挤离列表。桌面不受影响。 */
  .map-workspace .map-sheet-hint {
    display: none;
  }

  /* 半屏 / 展开时右列（定位 + 列表）会整个被面板盖住：面板上沿之上只剩 83px / 12px 的
     地图带，塞不进 104px 的竖排，所以整列收起；折叠态恢复。列表按钮在半屏态本来就多余
     （列表就是面板本身）。 */
  .map-workspace[data-sheet-state='half'] .map-mobile-rail,
  .map-workspace[data-sheet-state='expanded'] .map-mobile-rail {
    display: none;
  }

  /* 展开态同理：attribution 抬到基线上方会被顶出地图区（负 y 被裁掉），回它自己的原位 */

}


  /* 浏览数：贴在搜索胶囊右下角，纯文字、无底色、不抢视线 */
  .map-workspace .map-view-stats-mini {
    position: absolute;
    right: 0.875rem;
    bottom: 2px;
    left: auto;
    z-index: 41;
    border: 0;
    background: transparent;
    box-shadow: none;
    backdrop-filter: none;
    padding: 0;
    font-size: 9px;
    line-height: 1;
    color: var(--muted-ink);
    opacity: 0.62;
    pointer-events: none;
    white-space: nowrap;
  }


  /* 分类只剩 5 个：上排 3 个、下排 2 个各占一半，不留空洞 */
  @media (max-width: 767px) {
    .map-workspace .map-sheet-categories {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }

    .map-workspace .map-sheet-categories > * {
      grid-column: span 2;
    }

    .map-workspace .map-sheet-categories > *:nth-child(n + 4) {
      grid-column: span 3;
    }
  }
</style>
