import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import type { GeoPoint, MapArea, MapMountOptions, MapPoi } from '../map/core/types'
import type {
  AreaSelectHandler,
  MapBaseStyle,
  MapDisplayOptions,
  MapErrorHandler,
  MapProvider,
  PoiSelectHandler,
  PointPickedHandler,
  RouteSummary
} from '../map/core/provider'
import {
  formatMapRouteSummary,
  getCurrentMapPoint,
  MAP_LOCATION_OPTIONS,
  MAP_ROUTE_LOCATION_OPTIONS,
  planWalkingMapRoute,
  resolveMapLocateFailureNotice,
  resolveMapLocateGuard,
  resolveMapWalkingRouteFailureNotice,
  resolveMapWalkingRouteStartGuard
} from '../app/utils/map-geolocation'

function position(longitude: number, latitude: number): GeolocationPosition {
  return {
    coords: {
      longitude,
      latitude,
      accuracy: 5,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null
    },
    timestamp: 1
  }
}

function geolocation(
  handler: (
    success: PositionCallback,
    error: PositionErrorCallback | null,
    options: PositionOptions | undefined
  ) => void
): Pick<Geolocation, 'getCurrentPosition'> {
  return {
    getCurrentPosition: handler as Geolocation['getCurrentPosition']
  }
}

function mapProvider(overrides: Partial<MapProvider> = {}): MapProvider {
  return {
    id: 'amap',
    mount: async (_element: HTMLElement, _options?: MapMountOptions) => {},
    setPois: (_pois: MapPoi[]) => {},
    setAreas: (_areas: MapArea[]) => {},
    setDisplayOptions: (_options: MapDisplayOptions) => {},
    setBaseStyle: (_style: MapBaseStyle) => true,
    resize: () => {},
    fitToPois: () => {},
    enablePointPicker: (_handler: PointPickedHandler) => {},
    disablePointPicker: () => {},
    setSelectedPoi: (_id: string | null) => {},
    setSelectedArea: (_id: string | null) => {},
    flyToPoi: (_id: string) => true,
    flyToPoint: (_point: GeoPoint, _zoom?: number) => true,
    planWalkingRoute: async (_origin: GeoPoint, _destination: GeoPoint): Promise<RouteSummary> => ({
      distanceMeters: 100,
      durationSeconds: 60
    }),
    searchVisiblePois: async (_query: string) => [],
    clearRoute: () => {},
    onPoiSelect: (_handler: PoiSelectHandler) => () => {},
    onAreaSelect: (_handler: AreaSelectHandler) => () => {},
    onError: (_handler: MapErrorHandler) => () => {},
    destroy: () => {},
    ...overrides
  }
}

test('route summaries use readable distance and rounded-up minutes', () => {
  assert.equal(formatMapRouteSummary({ distanceMeters: 849.6, durationSeconds: 61 }), '约 850 米 · 2 分钟')
  assert.equal(formatMapRouteSummary({ distanceMeters: 1350, durationSeconds: 120 }), '约 1.4 公里 · 2 分钟')
  assert.equal(formatMapRouteSummary({ distanceMeters: 1, durationSeconds: 0 }), '约 1 米 · 1 分钟')
})

test('browser geolocation converts coordinates to WGS84 with bounded options', async () => {
  const point = await getCurrentMapPoint(geolocation((success, _error, options) => {
    assert.deepEqual(options, MAP_LOCATION_OPTIONS)
    success(position(118.6, 24.9))
  }))

  assert.deepEqual(point, { lng: 118.6, lat: 24.9, crs: 'WGS84' })
})

test('browser geolocation rejects permission failures with a stable internal error', async () => {
  await assert.rejects(
    getCurrentMapPoint(geolocation((_success, error) => {
      error?.({} as GeolocationPositionError)
    })),
    /MAP_GEOLOCATION_FAILED/
  )
})

test('walking route planning uses WGS84 origin and route-specific timeout', async () => {
  let routeCall: { origin: GeoPoint, destination: GeoPoint } | null = null
  const provider = mapProvider({
    async planWalkingRoute(origin, destination) {
      routeCall = { origin, destination }
      return { distanceMeters: 1280, durationSeconds: 780 }
    }
  })
  const destination: GeoPoint = { lng: 118.7, lat: 24.8, crs: 'GCJ-02' }
  const summary = await planWalkingMapRoute(() => provider, geolocation((success, _error, options) => {
    assert.deepEqual(options, MAP_ROUTE_LOCATION_OPTIONS)
    success(position(118.6, 24.9))
  }), destination)

  assert.deepEqual(routeCall, {
    origin: { lng: 118.6, lat: 24.9, crs: 'WGS84' },
    destination
  })
  assert.deepEqual(summary, { distanceMeters: 1280, durationSeconds: 780 })
})

test('walking route resolves the current provider after geolocation completes', async () => {
  let positionCallback: PositionCallback | null = null
  let currentProvider: MapProvider | null = null
  const destination: GeoPoint = { lng: 118.7, lat: 24.8, crs: 'GCJ-02' }
  const routePromise = planWalkingMapRoute(
    () => currentProvider,
    geolocation((success) => {
      positionCallback = success
    }),
    destination
  )

  currentProvider = mapProvider({
    async planWalkingRoute() {
      return { distanceMeters: 300, durationSeconds: 180 }
    }
  })
  assert.ok(positionCallback)
  positionCallback(position(118.6, 24.9))

  assert.deepEqual(await routePromise, { distanceMeters: 300, durationSeconds: 180 })
})

test('locate and walking-route guards keep student-facing notices pure', () => {
  assert.deepEqual(resolveMapLocateGuard(false), {
    ok: false,
    notice: { title: '当前浏览器不支持定位', color: 'warning' }
  })
  assert.deepEqual(resolveMapLocateGuard(true), { ok: true })
  assert.deepEqual(resolveMapLocateFailureNotice(), {
    title: '未能获取位置',
    description: '请检查浏览器定位权限，或稍后再试。',
    color: 'warning'
  })

  assert.deepEqual(resolveMapWalkingRouteStartGuard({
    hasDestination: false,
    activeMapProviderId: 'amap',
    hasGeolocation: true
  }), {
    ok: false,
    notice: { title: '这个地点还不能直接规划路线', color: 'warning' }
  })
  assert.deepEqual(resolveMapWalkingRouteStartGuard({
    hasDestination: true,
    activeMapProviderId: 'maplibre',
    hasGeolocation: true
  }), {
    ok: false,
    notice: { title: '切换到高德地图后才能在页面里规划路线', color: 'warning' }
  })
  assert.equal(resolveMapWalkingRouteStartGuard({
    hasDestination: true,
    activeMapProviderId: 'amap',
    hasGeolocation: false
  }).ok, false)
  assert.deepEqual(resolveMapWalkingRouteStartGuard({
    hasDestination: true,
    activeMapProviderId: 'amap',
    hasGeolocation: true
  }), { ok: true })

  const geoFail = resolveMapWalkingRouteFailureNotice(new Error('MAP_GEOLOCATION_FAILED'))
  assert.equal(geoFail.shouldClearRoute, false)
  assert.equal(geoFail.notice.title, '没能获取你的位置')
  const planFail = resolveMapWalkingRouteFailureNotice(new Error('other'))
  assert.equal(planFail.shouldClearRoute, true)
  assert.equal(planFail.notice.title, '这次没规划出路线')
  assert.equal(planFail.notice.description, '请检查定位权限，或稍后再试。')

  const composable = readFileSync(resolve('app/composables/useMapGeolocation.ts'), 'utf8')
  assert.match(composable, /resolveMapLocateGuard/)
  assert.match(composable, /resolveMapWalkingRouteStartGuard/)
  assert.match(composable, /resolveMapWalkingRouteFailureNotice/)
  assert.doesNotMatch(composable, /当前浏览器不支持定位/)
  assert.doesNotMatch(composable, /切换到高德地图后才能在页面里规划路线/)
})
