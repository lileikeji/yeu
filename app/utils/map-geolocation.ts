import type { GeoPoint } from '~~/map/core/types'
import type { MapProvider, RouteSummary } from '~~/map/core/provider'

export const MAP_LOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 8000,
  maximumAge: 30000
}

export const MAP_ROUTE_LOCATION_OPTIONS: PositionOptions = {
  ...MAP_LOCATION_OPTIONS,
  timeout: 10000
}

export function formatMapRouteSummary(summary: RouteSummary): string {
  const distance = summary.distanceMeters >= 1000
    ? `${(summary.distanceMeters / 1000).toFixed(1)} 公里`
    : `${Math.round(summary.distanceMeters)} 米`
  const minutes = Math.max(1, Math.ceil(summary.durationSeconds / 60))
  return `约 ${distance} · ${minutes} 分钟`
}

export function getCurrentMapPoint(
  geolocation: Pick<Geolocation, 'getCurrentPosition'>,
  options: PositionOptions = MAP_LOCATION_OPTIONS
): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lng: position.coords.longitude,
          lat: position.coords.latitude,
          crs: 'WGS84'
        })
      },
      () => reject(new Error('MAP_GEOLOCATION_FAILED')),
      options
    )
  })
}

export async function planWalkingMapRoute(
  getProvider: () => MapProvider | null,
  geolocation: Pick<Geolocation, 'getCurrentPosition'>,
  destination: GeoPoint
): Promise<RouteSummary> {
  const origin = await getCurrentMapPoint(geolocation, MAP_ROUTE_LOCATION_OPTIONS)
  const provider = getProvider()
  if (!provider) throw new Error('地图路线组件尚未就绪。')
  return provider.planWalkingRoute(origin, destination)
}

export interface MapGeolocationNotice {
  title: string
  description?: string
  color: 'warning'
}

export function resolveMapLocateGuard(hasGeolocation: boolean):
  | { ok: true }
  | { ok: false, notice: MapGeolocationNotice } {
  if (!hasGeolocation) {
    return {
      ok: false,
      notice: { title: '当前浏览器不支持定位', color: 'warning' }
    }
  }
  return { ok: true }
}

export function resolveMapLocateFailureNotice(): MapGeolocationNotice {
  return {
    title: '未能获取位置',
    description: '请检查浏览器定位权限，或稍后再试。',
    color: 'warning'
  }
}

export function resolveMapWalkingRouteStartGuard(input: {
  hasDestination: boolean
  activeMapProviderId: string | null | undefined
  hasGeolocation: boolean
}):
  | { ok: true }
  | { ok: false, notice: MapGeolocationNotice } {
  if (!input.hasDestination) {
    return {
      ok: false,
      notice: { title: '这个地点还不能直接规划路线', color: 'warning' }
    }
  }
  if (input.activeMapProviderId !== 'amap' && input.activeMapProviderId !== 'offline') {
    return {
      ok: false,
      notice: { title: '当前地图模式暂不支持页面内规划路线', color: 'warning' }
    }
  }
  if (!input.hasGeolocation) {
    return {
      ok: false,
      notice: { title: '当前浏览器不支持定位', color: 'warning' }
    }
  }
  return { ok: true }
}

export function resolveMapWalkingRouteFailureNotice(error: unknown): {
  notice: MapGeolocationNotice
  shouldClearRoute: boolean
} {
  const geolocationFailed = error instanceof Error && error.message === 'MAP_GEOLOCATION_FAILED'
  return {
    shouldClearRoute: !geolocationFailed,
    notice: {
      title: geolocationFailed ? '没能获取你的位置' : '这次没规划出路线',
      description: '请检查定位权限，或稍后再试。',
      color: 'warning'
    }
  }
}
