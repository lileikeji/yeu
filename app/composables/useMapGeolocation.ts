import type { GeoPoint } from '~~/map/core/types'
import type { MapProvider, MapProviderId, RouteSummary } from '~~/map/core/provider'
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
  getGeolocation?: () => Pick<Geolocation, 'getCurrentPosition'> | null
}

export function useMapGeolocation(options: UseMapGeolocationOptions) {
  const locating = ref(false)
  const routePlanning = ref(false)
  const routeSummary = ref<RouteSummary | null>(null)
  const routeDestinationName = ref('')
  const getGeolocation = options.getGeolocation ?? (() => (
    typeof navigator === 'undefined' ? null : navigator.geolocation
  ))

  function clearWalkingRoute(): void {
    options.mapProvider.value?.clearRoute()
    routePlanning.value = false
    routeSummary.value = null
    routeDestinationName.value = ''
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
    locateUser,
    startWalkingRoute,
    clearWalkingRoute
  }
}
