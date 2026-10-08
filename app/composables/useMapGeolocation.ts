import type { GeoPoint } from '~~/map/core/types'
import type { MapProvider, MapProviderId, MapRouteStep, MapUserLocation, RouteSummary } from '~~/map/core/provider'
import { estimateDurationSeconds, haversineMeters } from '~/utils/walk-route'
import {
  formatMapRouteSummary,
  getCurrentMapPoint,
  planWalkingMapRoute,
  planWalkingMapRouteFrom,
  resolveMapLocateFailureNotice,
  resolveMapLocateGuard,
  resolveMapWalkingRouteFailureNotice,
  resolveMapWalkingRouteStartGuard
} from '~/utils/map-geolocation'

interface MapActionNotice {
  title: string
  description?: string
  color: 'warning'
}

interface UseMapGeolocationOptions {
  mapProvider: { value: MapProvider | null }
  activeMapProviderId: { value: MapProviderId | null }
  notify: (notice: MapActionNotice) => void
  getGeolocation?: () => Pick<Geolocation, 'getCurrentPosition' | 'watchPosition' | 'clearWatch'> | null
  /** 定位失败导致无法规划时回调（打开"手动选起点"降级 UI）。 */
  onWalkingRouteLocationFailed?: (destinationName: string, destination: GeoPoint) => void
}

/** 实时跟踪位置更新间隔的最小位移（米）：小于该值不重绘，省电且避免抖动。 */
const TRACK_MIN_MOVE_METERS = 5
/** 导航剩余距离刷新的最小位移（米）。 */
const REMAINING_MIN_MOVE_METERS = 10

export function useMapGeolocation(options: UseMapGeolocationOptions) {
  const locating = ref(false)
  const routePlanning = ref(false)
  const routeSummary = ref<RouteSummary | null>(null)
  const routeSteps = ref<MapRouteStep[]>([])
  const routeDestinationName = ref('')
  const tracking = ref(false)
  const following = ref(false)
  const userLocation = ref<GeoPoint | null>(null)
  const remainingSummary = ref<RouteSummary | null>(null)
  let watchId: number | null = null
  let lastTrackedPoint: GeoPoint | null = null
  let lastRemainingPoint: GeoPoint | null = null
  let routeDestinationPoint: GeoPoint | null = null
  const getGeolocation = options.getGeolocation ?? (() => (
    typeof navigator === 'undefined' ? null : navigator.geolocation
  ))

  function clearWalkingRoute(): void {
    options.mapProvider.value?.clearRoute()
    routePlanning.value = false
    routeSummary.value = null
    routeSteps.value = []
    routeDestinationName.value = ''
    routeDestinationPoint = null
    remainingSummary.value = null
    stopTracking()
  }

  function stopTracking(): void {
    const geolocation = getGeolocation()
    if (watchId !== null && geolocation) {
      geolocation.clearWatch(watchId)
    }
    watchId = null
    tracking.value = false
    following.value = false
    lastTrackedPoint = null
    lastRemainingPoint = null
    userLocation.value = null
    options.mapProvider.value?.setUserLocation(null)
  }

  function refreshRemaining(current: GeoPoint): void {
    if (!routeDestinationPoint) return
    const distance = haversineMeters(current, routeDestinationPoint)
    remainingSummary.value = {
      distanceMeters: Math.max(0, Math.round(distance)),
      durationSeconds: estimateDurationSeconds(distance)
    }
  }

  function handleTrackedPosition(position: GeolocationPosition): void {
    const point: GeoPoint = {
      lng: position.coords.longitude,
      lat: position.coords.latitude,
      crs: 'WGS84'
    }
    const moved = !lastTrackedPoint
      || haversineMeters(lastTrackedPoint, point) >= TRACK_MIN_MOVE_METERS
    if (!moved) return

    lastTrackedPoint = point
    userLocation.value = point
    const location: MapUserLocation = {
      point,
      accuracyMeters: position.coords.accuracy ?? undefined
    }
    options.mapProvider.value?.setUserLocation(location)
    if (following.value) {
      options.mapProvider.value?.flyToPoint(point, 17)
    }
    if (!routeDestinationPoint) return
    const remainingMoved = !lastRemainingPoint
      || haversineMeters(lastRemainingPoint, point) >= REMAINING_MIN_MOVE_METERS
    if (!remainingMoved) return
    lastRemainingPoint = point
    refreshRemaining(point)
  }

  function startTracking(): void {
    const geolocation = getGeolocation()
    const guard = resolveMapLocateGuard(Boolean(geolocation))
    if (!guard.ok) {
      options.notify(guard.notice)
      return
    }
    if (watchId !== null) return

    tracking.value = true
    following.value = true
    watchId = geolocation!.watchPosition(
      (position) => {
        handleTrackedPosition(position)
      },
      () => {
        stopTracking()
        options.notify(resolveMapLocateFailureNotice())
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000
      }
    )
  }

  function toggleTracking(): void {
    if (tracking.value) {
      stopTracking()
      return
    }
    startTracking()
  }

  function toggleFollowing(): void {
    following.value = !following.value
    if (following.value && userLocation.value) {
      options.mapProvider.value?.flyToPoint(userLocation.value, 17)
    }
  }

  function locateUser(): void {
    const geolocation = getGeolocation()
    const guard = resolveMapLocateGuard(Boolean(geolocation))
    if (!guard.ok) {
      options.notify(guard.notice)
      return
    }

    locating.value = true
    void getCurrentMapPoint(geolocation!)
      .then((point) => {
        options.mapProvider.value?.flyToPoint(point, 17)
        // 立即显示蓝点，再进入持续跟踪（watchPosition 首次回调可能较慢）。
        lastTrackedPoint = point
        userLocation.value = point
        options.mapProvider.value?.setUserLocation({ point })
        refreshRemaining(point)
        startTracking()
      })
      .catch(() => {
        options.notify(resolveMapLocateFailureNotice())
      })
      .finally(() => {
        locating.value = false
      })
  }

  function startWalkingRoute(destinationName: string, destination: GeoPoint | null): void {
    const geolocation = getGeolocation()
    const guard = resolveMapWalkingRouteStartGuard({
      hasDestination: Boolean(destination),
      activeMapProviderId: options.activeMapProviderId.value,
      hasGeolocation: Boolean(geolocation)
    })
    if (!guard.ok) {
      options.notify(guard.notice)
      return
    }

    if (!destination || !geolocation) return

    routePlanning.value = true
    void planWalkingMapRoute(() => options.mapProvider.value, geolocation, destination)
      .then((summary) => {
        routeSummary.value = summary
        routeSteps.value = summary.steps ?? []
        routeDestinationName.value = destinationName
        routeDestinationPoint = destination
        lastRemainingPoint = null
        remainingSummary.value = null
        // 规划成功后进入「导航中」：开启实时位置跟踪与剩余距离，但**不自动跟随**——
        // 高德 Walking 的 autoFitView 已把整条路线取景完成，若立刻飞到人所在位置
        // （17 级），整条路线会被甩出屏幕。默认保持路线全景，需要时点「跟随」按钮。
        startTracking()
        following.value = false
      })
      .catch((error: unknown) => {
        const failure = resolveMapWalkingRouteFailureNotice(error)
        if (failure.shouldClearRoute) clearWalkingRoute()
        options.notify(failure.notice)
        if (error instanceof Error && error.message === 'MAP_GEOLOCATION_FAILED') {
          options.onWalkingRouteLocationFailed?.(destinationName, destination)
        }
      })
      .finally(() => {
        routePlanning.value = false
      })
  }

  /**
   * 手动选起点规划：跳过浏览器定位，直接用用户挑的锚点（校门/公交站等）当起点。
   * 定位可用时仍开启跟踪以显示剩余距离；不支持定位的浏览器则只画路线。
   */
  function startWalkingRouteFrom(
    originName: string,
    origin: GeoPoint,
    destinationName: string,
    destination: GeoPoint | null
  ): void {
    const guard = resolveMapWalkingRouteStartGuard({
      hasDestination: Boolean(destination),
      activeMapProviderId: options.activeMapProviderId.value,
      hasGeolocation: true
    })
    if (!guard.ok) {
      options.notify(guard.notice)
      return
    }

    if (!destination) return

    routePlanning.value = true
    void planWalkingMapRouteFrom(() => options.mapProvider.value, origin, destination)
      .then((summary) => {
        routeSummary.value = summary
        routeSteps.value = summary.steps ?? []
        routeDestinationName.value = destinationName
        routeDestinationPoint = destination
        lastRemainingPoint = null
        remainingSummary.value = null
        if (getGeolocation()) {
          startTracking()
          following.value = false
        }
      })
      .catch((error: unknown) => {
        const failure = resolveMapWalkingRouteFailureNotice(error)
        if (failure.shouldClearRoute) clearWalkingRoute()
        options.notify(failure.notice)
      })
      .finally(() => {
        routePlanning.value = false
      })
  }

  return {
    locating: readonly(locating),
    routePlanning: readonly(routePlanning),
    routeSummary: readonly(routeSummary),
    routeDestinationName: readonly(routeDestinationName),
    routeSummaryText: formatMapRouteSummary,
    tracking: readonly(tracking),
    following: readonly(following),
    userLocation: readonly(userLocation),
    remainingSummary: readonly(remainingSummary),
    routeSteps: readonly(routeSteps),
    locateUser,
    startWalkingRoute,
    startWalkingRouteFrom,
    clearWalkingRoute,
    toggleTracking,
    toggleFollowing
  }
}
