import type { Ref } from 'vue'
import type { CoordinateReferenceSystem } from '~~/shared/types'
import type { MapProvider } from '~~/map/core/provider'
import type { MapBus, MapBusRoute, MapBusStop } from '~~/map/core/types'
import { BUS_POSITIONS_API_PATH } from '~~/shared/constants/server'
import { observeMotion, stepMotion, type BusMotionState } from '~~/shared/utils/bus-motion'
import { bumpDistancesOnLine, computeBusProgress, cumulativeDistances, samplePolylinePoint } from '~~/shared/utils/bus-route-progress'

/** 线路快照（校车实时接口响应 routes[]，路径见 shared/constants/server.ts BUS_POSITIONS_API_PATH）。 */
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

/** 校车实时接口响应。 */
interface BusPositionsResponse {
  coordinateSystem: string
  fetchedAt: string
  routes: BusRouteSnapshot[]
  buses: BusSnapshot[]
}

/** 与服务端 5s 缓存对齐的轮询间隔。 */
const POLL_INTERVAL_MS = 5_000
/** 显示平滑节拍（ms）：轮询之间沿折线推进动画显示位，车标不再硬跳。 */
const MOTION_TICK_MS = 150

/** YKT 坐标系字符串 → 项目 CRS 枚举（未知值按 WGS84 处理）。 */
function toCrs(value: string): CoordinateReferenceSystem {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (normalized === 'GCJ02') return 'GCJ-02'
  if (normalized === 'BD09') return 'BD-09'
  return 'WGS84'
}

/**
 * 校车图层同步：每 5 秒拉取云一卡通校车快照（线路折线 + 起终点 + 实时车位置），
 * 喂给地图 provider 的 setBusRoutes/setBuses。车位置经 motion 平滑（沿线里程动画），
 * 卸载时清空图层。
 */
export function useMapBusPositions(options: { mapProvider: Ref<MapProvider | null> }) {
  let timer: ReturnType<typeof globalThis.setInterval> | null = null
  let motionTimer: ReturnType<typeof globalThis.setInterval> | null = null
  let stopped = false

  // 面板数据（MapBusRoutePanel）：与地图图层同源，按轮询刷新。
  const routes = ref<BusRouteSnapshot[]>([])
  const buses = ref<BusSnapshot[]>([])
  const fetchedAt = ref<string | null>(null)

  // 平滑状态：busId → 沿线里程动画（观测与显示分离）。
  const motionStates = new Map<string, BusMotionState>()
  const motionLengths = new Map<string, number>()
  const motionLines = new Map<string, Array<{ lng: number, lat: number }>>()
  // 每条线路的减速带沿线里程（米），用于动画在减速带上停顿；按线路缓存，避免每帧重算。
  const bumpCache = new Map<string, number[]>()

  function bumpsOf(routeId: string, line: Array<{ lng: number, lat: number }>): number[] {
    const cached = bumpCache.get(routeId)
    if (cached) return cached
    const bumps = bumpDistancesOnLine(line, cumulativeDistances(line))
    bumpCache.set(routeId, bumps)
    return bumps
  }
  let lastData: BusPositionsResponse | null = null

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

  /**
   * 由快照构建平滑显示位：新 fix 观测入 motion 状态，显示位沿折线取样，
   * 面板快照与地图 MapBus 用同一份坐标（含车头朝向角）。
   *
   * 云一卡通把同一台车按「车 × 线路」各上报一条（去程/回程都有一条），
   * 直接透传会让一台车同时出现在两个方向的小窗里、进度还按反向折算。
   * 这里按 busName 去重，并用主线路（去程）里程的变化方向判定它实际在跑哪一趟。
   */
  const lastAlongByName = new Map<string, number>()
  const directionByName = new Map<string, 'forward' | 'back'>()

  function lineOf(route: BusRouteSnapshot | undefined): Array<{ lng: number, lat: number }> {
    const polyline = (route?.polyline ?? []).map(point => ({ lng: point.lng, lat: point.lat }))
    if (polyline.length >= 2) return polyline
    return (route?.stops ?? []).map(stop => ({ lng: stop.lng, lat: stop.lat }))
  }

  /**
   * 这台车真实在跑哪一趟：线路把「车 × 线路」各上报一条，坐标完全相同，
   * 靠「下一站」站点在每条线路上的沿线里程判断——正确那趟的下一站在车前方且很近，
   * 反的那趟同一站在身后或快到终点，得分会被罚到极大。
   */
  function pickTrip(bus: BusSnapshot, routes: BusRouteSnapshot[]): { route: BusRouteSnapshot, progress: ReturnType<typeof computeBusProgress> } | null {
    let best: { route: BusRouteSnapshot, progress: NonNullable<ReturnType<typeof computeBusProgress>>, score: number } | null = null
    for (const route of routes) {
      const stops = route.stops.map(stop => ({ lng: stop.lng, lat: stop.lat }))
      const polyline = (route.polyline ?? []).map(point => ({ lng: point.lng, lat: point.lat }))
      if (stops.length < 2 || polyline.length < 2) continue
      const progress = computeBusProgress({ lng: bus.lng, lat: bus.lat }, stops, polyline, { isAtSite: bus.isAtSite })
      if (!progress) continue
      const index = route.stops.findIndex(stop => stop.siteId === bus.siteId)
      const stopAlong = index >= 0 ? progress.stopDistancesAlong[index] : undefined
      const ahead = stopAlong === undefined ? progress.distanceToNextStopMeters : stopAlong - progress.distanceAlong
      const score = ahead >= -25 ? ahead : 1e6 + Math.abs(ahead)
      if (!best || score < best.score) best = { route, progress, score }
    }
    return best ? { route: best.route, progress: best.progress } : null
  }

  function buildDisplay(data: BusPositionsResponse): { snapshots: BusSnapshot[], mapBuses: MapBus[] } {
    const crs = toCrs(data.coordinateSystem)
    const now = Date.now()
    const snapshots: BusSnapshot[] = []
    const mapBuses: MapBus[] = []

    // 同一台车在两条线路上各上报一次：按 busName 分组，只留「下一站对得上」的那条。
    const groups = new Map<string, BusSnapshot[]>()
    for (const bus of data.buses) {
      const list = groups.get(bus.busName)
      if (list) list.push(bus)
      else groups.set(bus.busName, [bus])
    }

    for (const [name, entries] of groups) {
      const trip = entries
        .map(entry => ({ entry, picked: pickTrip(entry, data.routes) }))
        .filter((item): item is { entry: BusSnapshot, picked: NonNullable<ReturnType<typeof pickTrip>> } => Boolean(item.picked))
        .sort((a, b) => a.picked!.progress!.distanceToNextStopMeters - b.picked!.progress!.distanceToNextStopMeters)[0]
      const bus = trip?.entry ?? entries[0]!
      const progress = trip?.picked?.progress ?? null
      const route = trip?.picked?.route
      const line = route
        ? ((route.polyline ?? []).length >= 2
            ? route.polyline!.map(point => ({ lng: point.lng, lat: point.lat }))
            : route.stops.map(stop => ({ lng: stop.lng, lat: stop.lat })))
        : []

      let lng = bus.lng
      let lat = bus.lat
      let angleDeg = progress?.angleDeg ?? 0
      if (progress && line.length >= 2) {
        motionLengths.set(name, progress.distanceAlong + progress.distanceToDestinationMeters)
        motionLines.set(name, line)
        const state = observeMotion(
          motionStates.get(name) ?? null,
          progress.distanceAlong,
          Date.parse(bus.updatedAt) || 0,
          now,
          1,
          bus.isAtSite ? 'waiting' : 'moving'
        )
        motionStates.set(name, state)
        const sampled = samplePolylinePoint(line, state.display)
        lng = sampled.point.lng
        lat = sampled.point.lat
        // 车头跟着线路切线走（不是跟着 GPS 抖动的位移），回程也是同一条折线的正向。
        angleDeg = sampled.angleDeg
      } else {
        motionStates.delete(name)
        motionLengths.delete(name)
      }
      snapshots.push({ ...bus, routeId: route?.routeId ?? bus.routeId, routeName: route?.routeName ?? bus.routeName, lng, lat })
      mapBuses.push({
        id: name,
        name: bus.busName,
        point: { lng, lat, crs },
        isAtSite: bus.isAtSite,
        siteName: bus.siteName,
        routeName: route?.routeName ?? bus.routeName,
        updatedAt: bus.updatedAt,
        angleDeg
      })
    }
    return { snapshots, mapBuses }
  }

  /** 把当前平滑显示位推给面板与地图。 */
  function pushDisplay(): void {
    if (!lastData || stopped) return
    const { snapshots, mapBuses } = buildDisplay(lastData)
    buses.value = snapshots
    options.mapProvider.value?.setBuses(mapBuses)
  }

  /** 节拍推进动画显示位；仅在有移动时重绘。 */
  function tickMotion(): void {
    const now = Date.now()
    const dt = Math.max(0, Math.min(1, (now - tickMotion.last) / 1000))
    tickMotion.last = now
    let moved = false
    for (const [id, state] of motionStates) {
      const length = motionLengths.get(id)
      if (!length) continue
      const line = motionLines.get(id)
      const bumps = line ? bumpsOf(id, line) : undefined
      if (stepMotion(state, now, dt, length, bumps)) moved = true
    }
    if (moved) pushDisplay()
  }
  tickMotion.last = Date.now()

  async function refresh(): Promise<void> {
    try {
      const data = await $fetch<BusPositionsResponse>(BUS_POSITIONS_API_PATH)
      if (stopped) return
      lastData = data
      routes.value = data.routes
      fetchedAt.value = data.fetchedAt
      const provider = options.mapProvider.value
      if (!provider) return
      provider.setBusRoutes(toRoutes(data))
      pushDisplay()
    } catch {
      // 拉取失败静默跳过，下一轮重试（页面不因校车数据报错）
    }
  }

  onMounted(() => {
    void refresh()
    timer = globalThis.setInterval(() => void refresh(), POLL_INTERVAL_MS)
    motionTimer = globalThis.setInterval(() => tickMotion(), MOTION_TICK_MS)
  })

  onBeforeUnmount(() => {
    stopped = true
    if (timer !== null) {
      globalThis.clearInterval(timer)
      timer = null
    }
    if (motionTimer !== null) {
      globalThis.clearInterval(motionTimer)
      motionTimer = null
    }
    motionStates.clear()
    motionLengths.clear()
    lastAlongByName.clear()
    directionByName.clear()
    lastData = null
    options.mapProvider.value?.setBuses([])
    options.mapProvider.value?.setBusRoutes([])
    routes.value = []
    buses.value = []
    fetchedAt.value = null
  })

  return { refreshBusPositions: refresh, routes, buses, fetchedAt }
}
