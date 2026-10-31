import type { Ref } from 'vue'
import type { CoordinateReferenceSystem } from '~~/shared/types'
import type { MapProvider } from '~~/map/core/provider'
import type { MapBus, MapBusRoute, MapBusStop } from '~~/map/core/types'

/** 线路快照（/api/public/bus-positions 响应 routes[]，见 server/modules/transit/ykt-bus.ts）。 */
export interface BusRouteSnapshot {
  routeId: string
  routeName: string
  isBack: boolean
  stops: Array<{
    siteId: string
    siteName: string
    lng: number
    lat: number
    isOrigin: boolean
    isDestination: boolean
  }>
  /** 沿实际道路的走向折线（服务端高德算路）；缺失时按站点直连。 */
  polyline?: Array<{ lng: number, lat: number }>
}

/** 车辆快照（响应 buses[]）。 */
export interface BusSnapshot {
  busId: string
  busName: string
  routeId: string
  routeName: string
  siteId: string
  siteName: string
  lng: number
  lat: number
  isAtSite: boolean
  updatedAt: string
}

/** /api/public/bus-positions 响应。 */
interface BusPositionsResponse {
  coordinateSystem: string
  fetchedAt: string
  routes: BusRouteSnapshot[]
  buses: BusSnapshot[]
}

/** 与服务端 5s 缓存对齐的轮询间隔。 */
const POLL_INTERVAL_MS = 5_000

/** YKT 坐标系字符串 → 项目 CRS 枚举（未知值按 WGS84 处理）。 */
function toCrs(value: string): CoordinateReferenceSystem {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (normalized === 'GCJ02') return 'GCJ-02'
  if (normalized === 'BD09') return 'BD-09'
  return 'WGS84'
}

/**
 * 校车图层同步：每 5 秒拉取云一卡通校车快照（线路折线 + 起终点 + 实时车位置），
 * 喂给地图 provider 的 setBusRoutes/setBuses。卸载时清空图层。
 */
export function useMapBusPositions(options: { mapProvider: Ref<MapProvider | null> }) {
  let timer: ReturnType<typeof globalThis.setInterval> | null = null
  let stopped = false

  // 面板数据（MapBusRoutePanel）：与地图图层同源，按轮询刷新。
  const routes = ref<BusRouteSnapshot[]>([])
  const buses = ref<BusSnapshot[]>([])
  const fetchedAt = ref<string | null>(null)

  function toRoutes(data: BusPositionsResponse): MapBusRoute[] {
    const crs = toCrs(data.coordinateSystem)
    return data.routes.map((route): MapBusRoute => ({
      id: route.routeId,
      name: route.routeName,
      stops: route.stops.map((stop): MapBusStop => ({
        id: stop.siteId,
        name: stop.siteName,
        point: { lng: stop.lng, lat: stop.lat, crs },
        isOrigin: stop.isOrigin,
        isDestination: stop.isDestination
      })),
      polyline: (route.polyline ?? [])
        .filter(point => Number.isFinite(point.lng) && Number.isFinite(point.lat))
        .map(point => ({ lng: point.lng, lat: point.lat, crs }))
    }))
  }

  function toBuses(data: BusPositionsResponse): MapBus[] {
    const crs = toCrs(data.coordinateSystem)
    return data.buses.map((bus): MapBus => ({
      id: bus.busId,
      name: bus.busName,
      point: { lng: bus.lng, lat: bus.lat, crs },
      isAtSite: bus.isAtSite,
      siteName: bus.siteName,
      routeName: bus.routeName,
      updatedAt: bus.updatedAt
    }))
  }

  async function refresh(): Promise<void> {
    try {
      const data = await $fetch<BusPositionsResponse>('/api/public/bus-positions')
      if (stopped) return
      routes.value = data.routes
      buses.value = data.buses
      fetchedAt.value = data.fetchedAt
      const provider = options.mapProvider.value
      if (!provider) return
      provider.setBusRoutes(toRoutes(data))
      provider.setBuses(toBuses(data))
    } catch {
      // 拉取失败静默跳过，下一轮重试（页面不因校车数据报错）
    }
  }

  onMounted(() => {
    void refresh()
    timer = globalThis.setInterval(() => void refresh(), POLL_INTERVAL_MS)
  })

  onBeforeUnmount(() => {
    stopped = true
    if (timer !== null) {
      globalThis.clearInterval(timer)
      timer = null
    }
    options.mapProvider.value?.setBuses([])
    options.mapProvider.value?.setBusRoutes([])
    routes.value = []
    buses.value = []
    fetchedAt.value = null
  })

  return { refreshBusPositions: refresh, routes, buses, fetchedAt }
}
