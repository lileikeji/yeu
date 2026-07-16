import type { GeoPoint } from '~~/map/core/types'
import type { MapProvider, MapProviderId, RouteSummary } from '~~/map/core/provider'
import {
  formatMapRouteSummary,
  getCurrentMapPoint,
  planWalkingMapRoute
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
    if (!geolocation) {
      options.notify({ title: '当前浏览器不支持定位', color: 'warning' })
      return
    }

    locating.value = true
    void getCurrentMapPoint(geolocation)
      .then((point) => {
        options.mapProvider.value?.flyToPoint(point, 17)
      })
      .catch(() => {
        options.notify({
          title: '未能获取位置',
          description: '请检查浏览器定位权限，或稍后再试。',
          color: 'warning'
        })
      })
      .finally(() => {
        locating.value = false
      })
  }

  function startWalkingRoute(destinationName: string, destination: GeoPoint | null): void {
    if (!destination) {
      options.notify({ title: '该地点暂无可用坐标', color: 'warning' })
      return
    }
    if (options.activeMapProviderId.value !== 'amap') {
      options.notify({ title: '网页内路线仅支持高德地图', color: 'warning' })
      return
    }

    const geolocation = getGeolocation()
    if (!geolocation) {
      options.notify({ title: '当前浏览器不支持定位', color: 'warning' })
      return
    }

    routePlanning.value = true
    void planWalkingMapRoute(() => options.mapProvider.value, geolocation, destination)
      .then((summary) => {
        routeSummary.value = summary
        routeDestinationName.value = destinationName
      })
      .catch((error: unknown) => {
        const geolocationFailed = error instanceof Error && error.message === 'MAP_GEOLOCATION_FAILED'
        if (!geolocationFailed) clearWalkingRoute()
        options.notify({
          title: geolocationFailed
            ? '未能获取当前位置'
            : '路线规划失败',
          description: '请检查浏览器定位权限，或稍后再试。',
          color: 'warning'
        })
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
