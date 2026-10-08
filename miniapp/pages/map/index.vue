<script setup lang="ts">
import { onLoad, onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { computed, ref, watch } from 'vue'
import { mapCategoryFromPlaceType } from '@shared/utils/place-map-category'
import { toMapCoordinate, wgs84ToGcj02 } from '@shared/utils/coordinate-convert'
import {
  MAP_CATEGORY_COLORS,
  MAP_CATEGORY_LABELS,
  MAP_DEFAULT_COLOR,
  isPlaceCoordinateVerified,
  resolvePlaceNavigationStatusLabel,
  resolvePlaceStudentSummary
} from '@shared/utils/place-presentation'
import PlaceCard from '../../components/PlaceCard.vue'
import StateView from '../../components/StateView.vue'
import { getWalkingRoute, listPlaces } from '../../services/catalog'
import { explainError, openLocation, openPlace } from '../../utils/navigation'
import { trackMiniApp } from '../../services/http'
import { rememberRecent } from '../../utils/recent'
import { formatDistanceLabel, formatRouteSummary } from '@shared/utils/route-presentation'
import type { MiniAppPlace, MiniAppWalkingRoute } from '../../types/app'

type SheetState = 'collapsed' | 'half' | 'expanded'

const places = ref<MiniAppPlace[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const selectedSlug = ref('')
const filter = ref('all')
const mapError = ref<string | null>(null)
const locationError = ref<string | null>(null)
const mapKey = ref(0)
/** 地图默认中心：库里是 WGS84，微信 map 需要 GCJ-02。 */
const center = ref(wgs84ToGcj02(118.60513135, 25.11207855))
const mapScale = ref(15)
const page = ref(1)
const hasMore = ref(false)
const loadingMore = ref(false)

/* —— 站内步行路线规划（服务端代理高德 Web 服务） —— */
const walkingRoute = ref<MiniAppWalkingRoute | null>(null)
const routeLoading = ref(false)
const routeError = ref<string | null>(null)
/** 没拿到定位时服务端从校区中心起算，需要如实告诉用户。 */
const routeFromCampusCenter = ref(false)

/* —— 底部面板：与网页端一致的三档锚点（收起 / 半屏 / 全屏），可拖拽吸附 —— */
const HANDLE_HEIGHT = 46
const sheetState = ref<SheetState>('collapsed')
const sheetDragHeight = ref<number | null>(null)
const windowHeight = ref(600)
let dragStartY = 0
let dragStartHeight = 0
let dragMoved = false

const sheetAnchors = computed<Record<SheetState, number>>(() => ({
  collapsed: HANDLE_HEIGHT,
  half: Math.round(windowHeight.value * 0.58),
  expanded: Math.max(HANDLE_HEIGHT, windowHeight.value - 64)
}))

const sheetHeight = computed(() => sheetDragHeight.value ?? sheetAnchors.value[sheetState.value])

function nearestSheetState(height: number): SheetState {
  const anchors = sheetAnchors.value
  const states: SheetState[] = ['collapsed', 'half', 'expanded']
  return states.reduce((closest, state) => (
    Math.abs(anchors[state] - height) < Math.abs(anchors[closest] - height) ? state : closest
  ), 'collapsed' as SheetState)
}

function touchClientY(event: TouchEvent): number {
  const touch = event.touches[0] as { clientY?: number } | undefined
  return touch?.clientY ?? 0
}

function onHandleStart(event: TouchEvent): void {
  dragStartY = touchClientY(event)
  dragStartHeight = sheetHeight.value
  dragMoved = false
}

function onHandleMove(event: TouchEvent): void {
  const currentY = touchClientY(event) || dragStartY
  const delta = dragStartY - currentY
  if (Math.abs(delta) > 8) dragMoved = true
  const anchors = sheetAnchors.value
  sheetDragHeight.value = Math.min(anchors.expanded, Math.max(HANDLE_HEIGHT, dragStartHeight + delta))
}

function onHandleEnd(): void {
  const height = sheetDragHeight.value
  if (height !== null) sheetState.value = nearestSheetState(height)
  sheetDragHeight.value = null
}

function onHandleTap(): void {
  if (dragMoved) {
    dragMoved = false
    return
  }
  sheetState.value = sheetState.value === 'collapsed' ? 'half' : sheetState.value === 'half' ? 'expanded' : 'collapsed'
}

/* —— 数据 —— */
function categoryOf(place: MiniAppPlace): string {
  return mapCategoryFromPlaceType(place.type, place.scope)
}

function colorOf(category: string): string {
  return MAP_CATEGORY_COLORS[category] ?? MAP_DEFAULT_COLOR
}

const filters = computed(() => {
  const present = new Set(places.value.map(categoryOf))
  return [
    { id: 'all', label: '全部', color: MAP_DEFAULT_COLOR, count: places.value.length },
    ...Object.entries(MAP_CATEGORY_LABELS)
      .filter(([id]) => present.has(id))
      .map(([id, label]) => ({
        id,
        label,
        color: colorOf(id),
        count: places.value.filter(place => categoryOf(place) === id).length
      }))
  ]
})

const visiblePlaces = computed(() => filter.value === 'all'
  ? places.value
  : places.value.filter(place => categoryOf(place) === filter.value))

const missingCoordinateCount = computed(() => visiblePlaces.value.filter(place => place.latitude === null || place.longitude === null).length)

const selectedPlace = computed(() => places.value.find(place => place.slug === selectedSlug.value) || null)

const selectedPlaceSummary = computed(() => selectedPlace.value
  ? resolvePlaceStudentSummary(selectedPlace.value.summary, selectedPlace.value.name, selectedPlace.value.category, selectedPlace.value.type)
  : '')

const selectedPlaceNavLabel = computed(() => selectedPlace.value
  ? resolvePlaceNavigationStatusLabel(isPlaceCoordinateVerified(selectedPlace.value))
  : '')

const mappablePlaces = computed(() => visiblePlaces.value
  .filter(place => place.latitude !== null && place.longitude !== null))

/** 可落图的地点：坐标统一换算成 GCJ-02 后再交给微信 map。 */
const markerEntries = computed(() => mappablePlaces.value
  .map(place => ({ place, coordinate: toMapCoordinate(place.longitude, place.latitude, place.coordinateSystem) }))
  .filter((entry): entry is { place: MiniAppPlace, coordinate: { longitude: number, latitude: number } } => entry.coordinate !== null))

const markers = computed(() => markerEntries.value.map((entry, index) => {
  const isSelected = selectedSlug.value === entry.place.slug
  return {
    id: index,
    latitude: entry.coordinate.latitude,
    longitude: entry.coordinate.longitude,
    title: entry.place.name,
    iconPath: `/static/marker/pin-${categoryOf(entry.place)}.png`,
    width: isSelected ? 36 : 27,
    height: isSelected ? 45 : 34,
    anchor: { x: 0.5, y: 1 },
    zIndex: isSelected ? 10 : 1,
    callout: {
      content: entry.place.name,
      display: isSelected ? 'ALWAYS' : 'BYCLICK',
      padding: 8,
      borderRadius: 8,
      bgColor: '#fffdf8',
      color: '#23281f',
      fontSize: 12
    }
  }
}))

/* —— 步行路线：折线 + 自动取景 + 摘要文案 —— */
const routePolyline = computed(() => {
  const route = walkingRoute.value
  if (!route || route.polyline.length < 2) return []
  return [{
    points: route.polyline.map(point => ({ longitude: point.longitude, latitude: point.latitude })),
    color: '#176f46',
    width: 7,
    arrowLine: true,
    borderColor: '#fffdf8',
    borderWidth: 2
  }]
})

/**
 * 把路线框进可见区域。
 * 不能用 include-points：它按整个地图高度居中，底部路线卡片会盖住路线本身。
 * 所以自己算包围盒，并把中心往南挪一点，让路线整体落在卡片上方。
 */
function frameRoute(): void {
  const route = walkingRoute.value
  if (!route || route.polyline.length < 2) return
  let minLat = route.polyline[0]!.latitude
  let maxLat = minLat
  let minLng = route.polyline[0]!.longitude
  let maxLng = minLng
  for (const point of route.polyline) {
    minLat = Math.min(minLat, point.latitude)
    maxLat = Math.max(maxLat, point.latitude)
    minLng = Math.min(minLng, point.longitude)
    maxLng = Math.max(maxLng, point.longitude)
  }

  const latSpan = maxLat - minLat
  const lngSpan = maxLng - minLng
  const midLat = (minLat + maxLat) / 2
  const heightMeters = latSpan * 111_000
  const widthMeters = lngSpan * 111_000 * Math.cos(midLat / 180 * Math.PI)
  const spanMeters = Math.max(heightMeters, widthMeters)

  mapScale.value = spanMeters > 3000 ? 13
    : spanMeters > 1500 ? 14
      : spanMeters > 800 ? 15
        : spanMeters > 400 ? 16
          : 17

  // 纬度减小 = 视野往南挪 = 路线在屏幕上往上走，给底部卡片让出空间。
  const shift = Math.max(latSpan * 0.28, 0.0006)
  center.value = {
    latitude: midLat - shift,
    longitude: (minLng + maxLng) / 2
  }
}

const routeSummary = computed(() => walkingRoute.value
  ? formatRouteSummary(walkingRoute.value.distanceMeters, walkingRoute.value.durationSeconds)
  : '')

const routeSteps = computed(() => (walkingRoute.value?.steps ?? []).map(step => ({
  instruction: step.instruction,
  distance: formatDistanceLabel(step.distanceMeters)
})))

function currentLocationGcj02(): Promise<{ longitude: number, latitude: number } | null> {
  return new Promise((resolve) => {
    uni.getLocation({
      type: 'gcj02',
      success: result => resolve({ longitude: result.longitude, latitude: result.latitude }),
      fail: () => resolve(null)
    })
  })
}

async function planWalkingRoute(place: MiniAppPlace): Promise<void> {
  if (routeLoading.value) return
  routeLoading.value = true
  routeError.value = null
  walkingRoute.value = null
  trackMiniApp('module_view', '/pages/map/index', { target: 'walking-route', slug: place.slug })
  const origin = await currentLocationGcj02()
  routeFromCampusCenter.value = origin === null
  try {
    walkingRoute.value = await getWalkingRoute({ slug: place.slug, origin })
    sheetState.value = 'collapsed'
    sheetDragHeight.value = null
    frameRoute()
    trackMiniApp('route_plan', '/pages/map/index', {
      slug: place.slug,
      distance: walkingRoute.value.distanceMeters,
      origin: origin ? 'device' : 'campus'
    })
  } catch (cause) {
    routeError.value = explainError(cause)
    trackMiniApp('api_error', '/pages/map/index', {
      api: 'directions/walking',
      error: 'ROUTE_FAILED',
      status: (cause as { details?: { status?: number } })?.details?.status ?? 0
    })
  } finally {
    routeLoading.value = false
  }
}

function clearWalkingRoute(): void {
  walkingRoute.value = null
  routeError.value = null
  routeFromCampusCenter.value = false
}

/** 站内路线只做「看清怎么走」，真导航交给微信地图（有语音和实时转弯提示）。 */
function navigateToRouteDestination(): void {
  const place = selectedPlace.value
  if (place) openLocation(place)
}

function planSelectedRoute(): void {
  const place = selectedPlace.value
  if (place) void planWalkingRoute(place)
}

/**
 * 把当前分类的标点框进可见区域。
 * 底部面板会盖住下半屏，所以中心点按纬度跨度上移，避免标点藏在面板后面。
 * 周边（泉州市区）点位离校园很远，参与取景会把缩放拉到最远，所以按到校中心的距离过滤。
 */
const FRAME_ANCHOR = wgs84ToGcj02(118.60513135, 25.11207855)

function frameView(): void {
  const maxDegree = 0.06 // ≈6.6km，排除只有个别远的点位把缩放拉满
  const points = markerEntries.value
    .map(entry => entry.coordinate)
    .filter(point => Math.abs(point.latitude - FRAME_ANCHOR.latitude) <= maxDegree
      && Math.abs(point.longitude - FRAME_ANCHOR.longitude) <= maxDegree)
  if (points.length < 2) {
    center.value = FRAME_ANCHOR
    mapScale.value = 15
    return
  }

  let minLat = points[0]!.latitude
  let maxLat = points[0]!.latitude
  let minLng = points[0]!.longitude
  let maxLng = points[0]!.longitude
  for (const point of points) {
    minLat = Math.min(minLat, point.latitude)
    maxLat = Math.max(maxLat, point.latitude)
    minLng = Math.min(minLng, point.longitude)
    maxLng = Math.max(maxLng, point.longitude)
  }

  const latSpan = maxLat - minLat
  const lngSpan = maxLng - minLng
  // 粗略换算跨度米数（1 度纬度≈111km，经度按纬度收缩）。
  const heightMeters = latSpan * 111_000
  const widthMeters = lngSpan * 111_000 * Math.cos((minLat + maxLat) / 2 / 180 * Math.PI)
  const spanMeters = Math.max(heightMeters, widthMeters)

  mapScale.value = spanMeters > 3000 ? 13
    : spanMeters > 1500 ? 14
      : spanMeters > 800 ? 15
        : spanMeters > 400 ? 16
          : 17

  center.value = {
    latitude: (minLat + maxLat) / 2 + latSpan * 0.12,
    longitude: (minLng + maxLng) / 2
  }
}

async function loadPlaces(): Promise<void> {  loading.value = true
  error.value = null
  page.value = 1
  try {
    const response = await listPlaces({ page: 1, pageSize: 100 })
    places.value = response.items
    hasMore.value = response.total > response.page * response.pageSize
    if (selectedSlug.value && !places.value.some(place => place.slug === selectedSlug.value)) selectedSlug.value = ''
    // 初次进入时把视野框到全部已核验标点，避免默认中心只看到半个校园。
    if (!selectedSlug.value) frameView()
  } catch (cause) {
    error.value = explainError(cause)
  } finally {
    loading.value = false
    uni.stopPullDownRefresh()
  }
}

async function loadMorePlaces(): Promise<void> {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  try {
    const nextPage = page.value + 1
    const response = await listPlaces({ page: nextPage, pageSize: 100 })
    places.value = [...places.value, ...response.items]
    page.value = nextPage
    hasMore.value = response.total > response.page * response.pageSize
  } catch (cause) {
    uni.showToast({ title: explainError(cause), icon: 'none' })
  } finally {
    loadingMore.value = false
  }
}

function applyFilter(value: string): void {
  filter.value = value
  clearWalkingRoute()
  if (selectedSlug.value && !visiblePlaces.value.some(place => place.slug === selectedSlug.value)) selectedSlug.value = ''
  frameView()
}

function focusPlace(place: MiniAppPlace): void {
  const coordinate = toMapCoordinate(place.longitude, place.latitude, place.coordinateSystem)
  if (!coordinate) return
  center.value = coordinate
  mapScale.value = 17
}

function selectMarker(event: { detail: { markerId: number } }): void {
  const entry = markerEntries.value[event.detail.markerId]
  if (!entry) return
  clearWalkingRoute()
  selectedSlug.value = entry.place.slug
  center.value = entry.coordinate
  mapScale.value = 17
  // 与网页端一致：选中标点时收起列表面板，把地图和地点卡片让出来。
  sheetState.value = 'collapsed'
  sheetDragHeight.value = null
  trackMiniApp('map_marker_select', '/pages/map/index', { slug: entry.place.slug, id: entry.place.id })
}

function clearSelection(): void {
  selectedSlug.value = ''
  clearWalkingRoute()
}

function selectPlace(slug: string): void {
  selectedSlug.value = slug
  const place = places.value.find(item => item.slug === slug)
  if (place) {
    focusPlace(place)
    rememberRecent({ kind: 'place', slug: place.slug, title: place.name })
  }
  trackMiniApp('result_click', '/pages/map/index', { entityType: 'place', slug, id: place?.id })
  openPlace(slug)
}

function locateMe(): void {
  locationError.value = null
  uni.getLocation({
    type: 'gcj02',
    success: (result) => {
      center.value = { latitude: result.latitude, longitude: result.longitude }
      uni.showToast({ title: '已回到你的位置', icon: 'none' })
    },
    fail: () => {
      locationError.value = '没有拿到定位权限。可以在地图上直接点标记，或展开下面的列表选地点。'
      trackMiniApp('api_error', '/pages/map/index', { api: 'getLocation', error: 'LOCATION_DENIED' })
    }
  })
}

function handleMapError(): void {  mapError.value = '地图组件暂时无法显示，请重试或展开下面的列表打开地点。'
  trackMiniApp('api_error', '/pages/map/index', { api: 'native-map', error: 'MAP_RENDER_FAILED' })
}

function retryMap(): void {
  mapError.value = null
  mapKey.value += 1
}

function receiveRoutePlace(): void {
  const pendingCategory = uni.getStorageSync('miniapp-map-category')
  if (typeof pendingCategory === 'string' && pendingCategory) {
    uni.removeStorageSync('miniapp-map-category')
    if (filters.value.some(item => item.id === pendingCategory)) {
      filter.value = pendingCategory
      frameView()
    }
  }
  const pending = uni.getStorageSync('miniapp-map-place')
  if (typeof pending === 'string' && pending) {
    selectedSlug.value = pending
    uni.removeStorageSync('miniapp-map-place')
    const place = places.value.find(item => item.slug === pending)
    if (place) {
      filter.value = 'all'
      sheetState.value = 'collapsed'
    }
  }
}

onLoad((query) => {
  trackMiniApp('page_view', '/pages/map/index')
  try {
    windowHeight.value = uni.getSystemInfoSync().windowHeight || 600
  } catch {
    windowHeight.value = 600
  }
  if (typeof query?.place === 'string') selectedSlug.value = query.place
  void loadPlaces()
})
watch(selectedPlace, (place) => {
  if (place) focusPlace(place)
})

onShow(receiveRoutePlace)
onPullDownRefresh(() => { void loadPlaces() })
</script>

<template>
  <view class="map-screen">
    <map
      :key="mapKey"
      class="map-canvas"
      :latitude="center.latitude"
      :longitude="center.longitude"
      :scale="mapScale"
      :markers="markers"
      :polyline="routePolyline"
      :enable-clustering="true"
      show-location
      @markertap="selectMarker"
      @error="handleMapError"
    />

    <view class="overlay-top">
      <scroll-view class="filter-scroll" scroll-x>
        <view class="filter-row">
          <button
            v-for="item in filters"
            :key="item.id"
            class="filter-button"
            :class="{ selected: filter === item.id }"
            @click="applyFilter(item.id)"
          >
            <view class="filter-dot" :style="{ background: item.color }" />
            <text class="filter-text">{{ item.label }}</text>
            <text class="filter-count">{{ item.count }}</text>
          </button>
        </view>
      </scroll-view>
      <view v-if="locationError" class="overlay-note">
        <text class="t-meta">{{ locationError }}</text>
      </view>
      <view v-if="mapError" class="overlay-note overlay-error">
        <text class="t-meta">{{ mapError }}</text>
        <button class="btn-link" @click="retryMap">重试地图</button>
      </view>
    </view>

    <button class="map-locate" @click="locateMe">
      <text class="map-locate-text">定位</text>
    </button>

    <view v-if="selectedPlace && !walkingRoute" class="map-card" :style="{ bottom: `${sheetHeight + 16}px` }">
      <view class="map-card-head">
        <text class="t-item map-card-title">{{ selectedPlace.name }}</text>
        <text class="map-card-close" @click="clearSelection">×</text>
      </view>
      <text class="t-meta map-card-summary">{{ selectedPlaceSummary }}</text>
      <text v-if="selectedPlace.address" class="t-meta map-card-address">{{ selectedPlace.address }}</text>
      <view v-if="routeError" class="note note-error route-note">
        <text class="t-meta">{{ routeError }}</text>
      </view>
      <view class="map-card-foot">
        <text class="t-label">{{ selectedPlaceNavLabel }}</text>
        <view class="map-card-actions">
          <button class="btn btn-outline btn-sm" @click="selectPlace(selectedPlace.slug)">详情</button>
          <button
            v-if="selectedPlace.navigationAvailable"
            class="btn btn-outline btn-sm"
            :disabled="routeLoading"
            @click="planSelectedRoute"
          >
            {{ routeLoading ? '规划中' : '步行路线' }}
          </button>
          <button v-if="selectedPlace.navigationAvailable" class="btn btn-primary btn-sm" @click="openLocation(selectedPlace)">导航</button>
        </view>
      </view>
    </view>

    <view v-if="walkingRoute" class="map-card route-card" :style="{ bottom: `${sheetHeight + 16}px` }">
      <view class="map-card-head">
        <text class="t-item map-card-title">步行去 {{ walkingRoute.destination.label }}</text>
        <text class="map-card-close" @click="clearWalkingRoute">×</text>
      </view>
      <text class="t-item route-summary">{{ routeSummary }}</text>
      <text v-if="routeFromCampusCenter" class="t-meta route-origin-note">
        未获取定位，已按校区中心起算。
      </text>
      <scroll-view v-if="routeSteps.length" class="route-steps" scroll-y>
        <view v-for="(step, index) in routeSteps" :key="index" class="route-step">
          <text class="route-step-index">{{ index + 1 }}</text>
          <text class="t-meta route-step-text">{{ step.instruction }}</text>
          <text v-if="step.distance" class="route-step-distance">{{ step.distance }}</text>
        </view>
      </scroll-view>
      <view class="map-card-foot">
        <text class="t-label">高德步行路线</text>
        <view class="map-card-actions">
          <button class="btn btn-outline btn-sm" @click="selectPlace(walkingRoute.destination.slug)">详情</button>
          <button class="btn btn-primary btn-sm" @click="navigateToRouteDestination">用微信地图导航</button>
        </view>
      </view>
    </view>

    <view class="sheet" :class="{ dragging: sheetDragHeight !== null }" :style="{ height: `${sheetHeight}px` }">
      <view
        class="sheet-handle"
        @touchstart.stop="onHandleStart"
        @touchmove.stop="onHandleMove"
        @touchend.stop="onHandleEnd"
        @touchcancel.stop="onHandleEnd"
        @click="onHandleTap"
      >
        <view class="sheet-grip" />
        <view class="sheet-head">
          <text class="t-item sheet-title">地点列表</text>
          <text class="t-meta sheet-count">{{ visiblePlaces.length }} 处</text>
          <text class="map-card-close sheet-toggle">{{ sheetState === 'expanded' ? '收起' : '展开' }}</text>
        </view>
      </view>

      <scroll-view class="sheet-body" scroll-y>
        <view class="sheet-content">
          <view v-if="!loading && missingCoordinateCount" class="note note-pending coordinate-note">
            <text class="t-meta">有 {{ missingCoordinateCount }} 个地点还没有核验坐标，暂时只能看文字地址。</text>
          </view>
          <StateView
            :loading="loading"
            :error="error"
            :empty="!visiblePlaces.length"
            empty-text="这个分类暂时没有已发布地点。"
            @retry="loadPlaces"
          >
            <PlaceCard v-for="place in visiblePlaces" :key="place.id" :place="place" @open="selectPlace" />
            <button v-if="hasMore" class="btn btn-quiet load-more-button" :disabled="loadingMore" :loading="loadingMore" @click="loadMorePlaces">
              {{ loadingMore ? '正在加载' : '加载更多地点' }}
            </button>
          </StateView>
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<style scoped>
.map-screen {
  position: relative;
  width: 100%;
  height: 100vh;
  background: var(--paper);
  overflow: hidden;
}

.map-canvas {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.overlay-top {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  padding: 16rpx 24rpx 0;
}

.filter-scroll {
  width: 100%;
  white-space: nowrap;
}

.filter-row {
  display: inline-flex;
  gap: 12rpx;
}

.filter-button {
  display: flex;
  align-items: center;
  gap: 8rpx;
  min-height: 68rpx;
  padding: 0 22rpx;
  border: 1rpx solid var(--line);
  border-radius: 999rpx;
  color: var(--ink);
  background: var(--surface);
  font-size: 26rpx;
  line-height: 68rpx;
  box-shadow: 0 2rpx 10rpx -4rpx rgba(35, 40, 31, .28);
}

.filter-button.selected {
  border-color: var(--teal);
  background: var(--teal-soft);
}

.filter-dot {
  flex: 0 0 auto;
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
}

.filter-text {
  color: inherit;
  font-size: 26rpx;
}

.filter-count {
  color: var(--muted);
  font-size: 22rpx;
}

.overlay-note {
  margin-top: 16rpx;
  padding: 16rpx 20rpx;
  border-radius: 12rpx;
  background: var(--mustard-soft);
  box-shadow: 0 2rpx 10rpx -4rpx rgba(35, 40, 31, .28);
}

.overlay-error {
  background: var(--brick-soft);
}

.map-locate {
  position: absolute;
  top: 116rpx;
  right: 24rpx;
  min-height: 68rpx;
  padding: 0 26rpx;
  border: 1rpx solid var(--line);
  border-radius: 999rpx;
  color: var(--teal-dark);
  background: var(--surface);
  line-height: 68rpx;
  box-shadow: 0 2rpx 10rpx -4rpx rgba(35, 40, 31, .28);
}

.map-locate-text {
  font-size: 24rpx;
  font-weight: 700;
}

.map-card {
  position: absolute;
  right: 24rpx;
  left: 24rpx;
  padding: 22rpx 24rpx;
  border-radius: 16rpx;
  background: var(--surface);
  box-shadow: 0 8rpx 28rpx -12rpx rgba(35, 40, 31, .45);
  transition: bottom .18s ease;
}

.map-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.map-card-title {
  flex: 1;
  min-width: 0;
  font-size: 32rpx;
}

.map-card-close {
  flex: 0 0 auto;
  padding: 0 12rpx;
  color: var(--muted);
  font-size: 34rpx;
  line-height: 1.2;
}

.map-card-summary {
  display: -webkit-box;
  margin-top: 8rpx;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.map-card-address {
  margin-top: 6rpx;
  color: var(--ink);
}

.map-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-top: 16rpx;
}

.map-card-actions {
  display: flex;
  gap: 12rpx;
}

.route-card {
  padding-bottom: 18rpx;
}

.route-summary {
  margin-top: 8rpx;
  color: var(--teal-dark);
  font-size: 30rpx;
}

.route-origin-note {
  margin-top: 6rpx;
}

.route-note {
  margin-top: 14rpx;
}

.route-steps {
  max-height: 236rpx;
  margin-top: 14rpx;
  border-top: 1rpx solid var(--line);
}

.route-step {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  padding: 14rpx 0;
  border-bottom: 1rpx solid var(--line);
}

.route-step:last-child {
  border-bottom: 0;
}

.route-step-index {
  flex: 0 0 auto;
  width: 34rpx;
  height: 34rpx;
  border-radius: 50%;
  color: var(--teal-dark);
  background: var(--teal-soft);
  font-size: 22rpx;
  line-height: 34rpx;
  text-align: center;
}

.route-step-text {
  flex: 1;
  min-width: 0;
  color: var(--ink);
}

.route-step-distance {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 22rpx;
}

.sheet {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  border-radius: 24rpx 24rpx 0 0;
  background: var(--surface);
  box-shadow: 0 -8rpx 28rpx -12rpx rgba(35, 40, 31, .45);
  transition: height .22s ease;
  overflow: hidden;
}

.sheet.dragging {
  transition: none;
}

.sheet-handle {
  flex: 0 0 auto;
  padding: 12rpx 24rpx 14rpx;
}

.sheet-grip {
  width: 72rpx;
  height: 8rpx;
  margin: 0 auto 12rpx;
  border-radius: 999rpx;
  background: var(--line-strong);
}

.sheet-head {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
}

.sheet-title {
  font-size: 32rpx;
}

.sheet-count {
  flex: 1;
}

.sheet-toggle {
  font-size: 24rpx;
  font-weight: 600;
}

.sheet-body {
  flex: 1;
  min-height: 0;
}

.sheet-content {
  padding: 0 24rpx 32rpx;
}

.coordinate-note {
  margin-bottom: 20rpx;
}

.load-more-button {
  width: 100%;
  margin-top: 28rpx;
}
</style>
