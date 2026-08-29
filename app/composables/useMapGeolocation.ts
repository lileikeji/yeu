import type { GeoPoint } from '~~/map/core/types'
import type { MapProvider, MapProviderId, MapUserLocation, RouteSummary } from '~~/map/core/provider'
import { estimateDurationSeconds, haversineMeters } from '~/utils/walk-route'
import {
  formatMapRouteSummary,
  getCurrentMapPoint,
  planWalkingMapRoute,
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
}

/** 实时跟踪位置更新间隔的最小位移（米）：小于该值不重绘，省电且避免抖动。 */
const TRACK_MIN_MOVE_METERS = 5
/** 导航剩余距离刷新的最小位移（米）。 */
const REMAINING_MIN_MOVE_METERS = 10

export function useMapGeolocation(options: UseMapGeolocationOptions) {
  const locating = ref(false)
  const routePlanning = ref(false)
  const routeSummary = ref<RouteSummary | null>(null)
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

    routePlanning.value = true
    void planWalkingMapRoute(() => options.mapProvider.value, geolocation!, destination!)
      .then((summary) => {
        routeSummary.value = summary
        routeDestinationName.value = destinationName
        routeDestinationPoint = destination
        lastRemainingPoint = null
        remainingSummary.value = null
        // 规划成功后自动进入「导航中」：开启实时位置跟踪与相机跟随。
        startTracking()
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
    locateUser,
    startWalkingRoute,
    clearWalkingRoute,
    toggleTracking,
    toggleFollowing
  }
}
