import type { Ref } from 'vue'
import type { CoordinateReferenceSystem } from '~~/shared/types'
import type { MapProvider } from '~~/map/core/provider'
import type { MapBus, MapBusRoute, MapBusStop } from '~~/map/core/types'
import { ref, watch } from 'vue'
import { BUS_POSITIONS_API_PATH } from '~~/shared/constants/server'
import { alongOnPolyline, bearingDegrees, computeBusProgress, haversineMeters, samplePolylinePoint, snapToPolyline } from '~~/shared/utils/bus-route-progress'

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
  /** 方向判定后所属线路的返程标志（云一卡通同车两方向各上报一条）。 */
  isBack: boolean
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
export function useMapBusPositions(options: {
  mapProvider: Ref<MapProvider | null>
  /** 只看某条线路（去程/回程各算一条）；空串 = 两条都画，叠在一起会看不清。 */
  activeRouteId?: Ref<string>
}) {
  let timer: ReturnType<typeof globalThis.setInterval> | null = null
  let motionTimer: ReturnType<typeof globalThis.setInterval> | null = null
  let stopped = false

  // 面板数据（MapBusRoutePanel）：与地图图层同源，按轮询刷新。
  const routes = ref<BusRouteSnapshot[]>([])
  const buses = ref<BusSnapshot[]>([])
  const fetchedAt = ref<string | null>(null)

  /** 轮询之间的插值段：上一帧定位 → 本帧定位，span 内线性推进。 */
  const trails = new Map<string, { from: { lng: number, lat: number }, to: { lng: number, lat: number }, t0: number, span: number }>()
  /** 上一次上报的定位，用来判断这一轮是否真的有新坐标。 */
  const lastFix = new Map<string, { lng: number, lat: number }>()
  // 位置真变了才更新时间戳：面板「GPS 更新 N 秒前」据此显示，静止时不会一直 0 秒。
  const movedAt = new Map<string, number>()
  // 方向判定粘滞：busName -> 上一次选中的 routeId（见 buildDisplay）。
  const pickedRouteByBus = new Map<string, string>()
  let lastData: BusPositionsResponse | null = null

  /**
   * 站点压到线路上：YKT 的站点坐标是实地点位（门口、楼前），直接画会浮在路外、
   * 面板上的「下一站 / 距离」也会跟着偏。这里把每个站点投到本线路折线上最近的
   * 一点（30 米内才吸），站点标记就沿着线走了。
   */
  function snapStops(route: BusRouteSnapshot, crs: MapBusStop['point']['crs']): MapBusStop[] {
    const line = (route.polyline ?? []).filter(point => Number.isFinite(point.lng) && Number.isFinite(point.lat))
    return route.stops.map((stop): MapBusStop => {
      let point = { lng: stop.lng, lat: stop.lat }
      if (line.length >= 2) {
        const snapped = snapToPolyline(point, line)
        if (snapped && snapped.offsetMeters <= 30) point = snapped.point
      }
      return {
        id: stop.siteId,
        name: stop.siteName,
        point: { lng: point.lng, lat: point.lat, crs },
        isOrigin: stop.isOrigin,
        isDestination: stop.isDestination
      }
    })
  }

  function visibleRoutes(data: BusPositionsResponse): BusRouteSnapshot[] {
    const want = options.activeRouteId?.value ?? ''
    if (want) {
      const picked = data.routes.filter(route => route.routeId === want)
      if (picked.length) return picked
    }
    // 没选具体方向时只画一条：去程/回程走同一条路，两条叠着画会在弯道处
    // 露出另一方向的错位线，看着像「多出来一段斜线」。站点两边合并去重。
    if (data.routes.length <= 1) return data.routes
    const [first, ...rest] = data.routes
    const seen = new Set((first?.stops ?? []).map(stop => stop.siteName))
    const mergedStops = [...(first?.stops ?? [])]
    for (const route of rest) {
      for (const stop of route.stops ?? []) {
        if (seen.has(stop.siteName)) continue
        seen.add(stop.siteName)
        mergedStops.push(stop)
      }
    }
    return [{ ...first!, stops: mergedStops }]
  }

  function toRoutes(data: BusPositionsResponse): MapBusRoute[] {
    const crs = toCrs(data.coordinateSystem)
    return visibleRoutes(data).map((route): MapBusRoute => ({
      id: route.routeId,
      name: route.routeName,
      stops: snapStops(route, crs),
      polyline: (route.polyline ?? [])
        .filter(point => Number.isFinite(point.lng) && Number.isFinite(point.lat))
        .map(point => ({ lng: point.lng, lat: point.lat, crs }))
    }))
  }

  /**
   * 由快照构建显示位：按上报 GPS 做二维插值（不沿线投影、不吸站点），
   * 面板快照与地图 MapBus 用同一份坐标（含车头朝向角）。
   *
   * 云一卡通把同一台车按「车 × 线路」各上报一条（去程/回程都有一条），
   * 直接透传会让一台车同时出现在两个方向的小窗里、进度还按反向折算。
   * 这里按 busName 去重，并用主线路（去程）里程的变化方向判定它实际在跑哪一趟。
   */
  /**
   * 这台车真实在跑哪一趟：线路把「车 × 线路」各上报一条，坐标完全相同，
   * 靠「下一站」站点在每条线路上的沿线里程判断——正确那趟的下一站在车前方且很近，
   * 反的那趟同一站在身后或快到终点，得分会被罚到极大。
   */
  function pickTrip(bus: BusSnapshot, routes: BusRouteSnapshot[]): { route: BusRouteSnapshot, progress: ReturnType<typeof computeBusProgress>, score: number, secondScore: number } | null {
    let best: { route: BusRouteSnapshot, progress: NonNullable<ReturnType<typeof computeBusProgress>>, score: number } | null = null
    let secondScore = Infinity
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
      if (!best || score < best.score) {
        secondScore = best?.score ?? Infinity
        best = { route, progress, score }
      } else if (score < secondScore) {
        secondScore = score
      }
    }
    return best ? { route: best.route, progress: best.progress, score: best.score, secondScore } : null
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
      const scored = entries
        .map(entry => ({ entry, picked: pickTrip(entry, data.routes) }))
        .filter((item): item is { entry: BusSnapshot, picked: NonNullable<ReturnType<typeof pickTrip>> } => Boolean(item.picked))
        .sort((a, b) => a.picked!.progress!.distanceToNextStopMeters - b.picked!.progress!.distanceToNextStopMeters)
      const best = scored[0]
      // 方向粘滞：上游同车两方向各上报一条、坐标完全相同，车在站点上或下一站
      // 在线路中段时两个方向打分几乎一样，会来回翻转。分差小于 120m 时沿用
      // 上一轮的判定，等车开出一段（下一站真实拉开）再自动纠正。
      const lastRouteId = pickedRouteByBus.get(name)
      let chosen = best
      if (best && lastRouteId && best.entry.routeId !== lastRouteId) {
        const sticky = scored.find(item => item.entry.routeId === lastRouteId)
        if (sticky) {
          const diff = sticky.picked!.progress!.distanceToNextStopMeters - best.picked!.progress!.distanceToNextStopMeters
          if (diff < 120) chosen = sticky
        }
      }
      if (chosen) pickedRouteByBus.set(name, chosen.entry.routeId)
      else pickedRouteByBus.delete(name)
      const trip = chosen
      const bus = trip?.entry ?? entries[0]!
      const progress = trip?.picked?.progress ?? null
      const route = trip?.picked?.route
      const line = route
        ? ((route.polyline ?? []).length >= 2
            ? route.polyline!.map(point => ({ lng: point.lng, lat: point.lat }))
            : route.stops.map(stop => ({ lng: stop.lng, lat: stop.lat })))
        : []

      // 位置就用上报的 GPS：不再沿线投影、也不往站点上吸。
      // 两次 poll 之间按经纬度线性插值，车看起来是连续开的，但走的是自己的定位。
      const fix = { lng: bus.lng, lat: bus.lat }
      const previousFix = lastFix.get(name)
      if (!previousFix || haversineMeters(previousFix, fix) > 1.5) {
        const from = previousFix ?? fix
        trails.set(name, { from, to: fix, t0: now, span: POLL_INTERVAL_MS })
        lastFix.set(name, fix)
      }
      const trail = trails.get(name) ?? { from: fix, to: fix, t0: now, span: POLL_INTERVAL_MS }
      const ratio = Math.max(0, Math.min(1, (now - trail.t0) / Math.max(1, trail.span)))
      const lng = trail.from.lng + (trail.to.lng - trail.from.lng) * ratio
      const lat = trail.from.lat + (trail.to.lat - trail.from.lat) * ratio
      // 贴线：GPS 有 5–15 m 抖动，车头会歪到路肩外；把显示点吸到本方向折线上（30 m 内才吸，
      // 明显跑偏时保留原始定位，免得车被硬拽到别的路上去）。
      const snapped = line.length >= 2
        ? snapToPolyline({ lng, lat }, line)
        : null
      // 一律吸附：车标要压在线上（GPS 抖动 5–15 m 会让车看起来在路肩外）。
      let shown = snapped ? snapped.point : { lng, lat }
      // 车头用「当前显示位置所在线段」的切线，每个动画帧都重算：
      // 这样车刚拐进弯道时车头立刻跟着转，而不是等下一次 GPS 上报。
      const moved = haversineMeters(trail.from, trail.to)
      let angleDeg = snapped
        ? snapped.angleDeg
        : (progress?.angleDeg ?? (moved >= 2 ? bearingDegrees(trail.from, trail.to) : 0))
      // 定位卡住（同一位重复上报、车停在路边等客）时不要定死在原地：
      // 超过 20 秒没位移就按线路切线以 2.2 m/s 惯性推进，最多推 60 m。
      const stillSince = movedAt.get(name) ?? now
      if (snapped && line.length >= 2 && now - stillSince > 20_000) {
        const creep = Math.min(((now - stillSince) / 1000) * 2.2, 60)
        const ahead = samplePolylinePoint(line, alongOnPolyline(snapped.point, line) + creep)
        shown = ahead.point
        angleDeg = ahead.angleDeg
      }
      // 回程的折线方向与行驶方向相反，车头要补 180°。
      if (bus.isBack) angleDeg = (angleDeg + 180) % 360
      if (!movedAt.has(name) || haversineMeters(lastFix.get(name) ?? fix, fix) > 3) movedAt.set(name, now)
      snapshots.push({ ...bus, routeId: route?.routeId ?? bus.routeId, routeName: route?.routeName ?? bus.routeName, isBack: route?.isBack ?? false, lng: shown.lng, lat: shown.lat })
      mapBuses.push({
        id: name,
        name: bus.busName,
        point: { lng: shown.lng, lat: shown.lat, crs },
        isAtSite: bus.isAtSite,
        siteName: bus.siteName,
        routeName: route?.routeName ?? bus.routeName,
        updatedAt: bus.updatedAt,
        movedAt: movedAt.get(name) ?? now,
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

  /** 节拍推进插值显示位：每 150ms 用当前时间重算一次，轮询之间也连续移动。 */
  function tickMotion(): void {
    if (!lastData || stopped) return
    pushDisplay()
  }

  tickMotion.last = Date.now()

  if (options.activeRouteId) {
    watch(options.activeRouteId, () => {
      const provider = options.mapProvider.value
      if (provider && lastData) provider.setBusRoutes(toRoutes(lastData))
    })
  }

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
    trails.clear()
    lastFix.clear()
    movedAt.clear()
    lastData = null
    options.mapProvider.value?.setBuses([])
    options.mapProvider.value?.setBusRoutes([])
    routes.value = []
    buses.value = []
    fetchedAt.value = null
  })

  return { refreshBusPositions: refresh, routes, buses, fetchedAt }
}
