import type { Ref } from 'vue'
import type { CoordinateReferenceSystem } from '~~/shared/types'
import type { MapProvider } from '~~/map/core/provider'
import type { MapBus, MapBusRoute, MapBusStop } from '~~/map/core/types'
import { ref, watch } from 'vue'
import { BUS_POSITIONS_API_PATH } from '~~/shared/constants/server'
import { alongOnPolyline, cumulativeDistances, samplePolylinePoint, snapToPolyline } from '~~/shared/utils/bus-route-progress'
import { advanceBusTrack, createBusTrack, observeBusTrack, resetBusTrack, TRACK_OFF_ROUTE_M, type BusTrack } from '~~/shared/utils/bus-track'

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
/** 显示平滑节拍（ms）：两次上报之间按沿线里程向前推进，车标连续移动。 */
const MOTION_TICK_MS = 150

/** 一台车的渲染状态：所属线路 + 沿线里程跟踪器。 */
interface BusRender {
  bus: BusSnapshot
  route: BusRouteSnapshot
  line: Array<{ lng: number, lat: number }>
  /** 本帧投影到该线路上的沿线里程（米）。 */
  along: number
  totalMeters: number
  offsetMeters: number
  track: BusTrack
  /** 连续几轮「上报点不在线路上」（车停在车场）：累计 3 轮就不再画这辆车。 */
  misses: number
}

/** 本帧的候选线路（还没和跟踪状态合并）。 */
type BusCandidate = Omit<BusRender, 'track' | 'misses'>

/** YKT 坐标系字符串 → 项目 CRS 枚举（未知值按 WGS84 处理）。 */
function toCrs(value: string): CoordinateReferenceSystem {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (normalized === 'GCJ02') return 'GCJ-02'
  if (normalized === 'BD09') return 'BD-09'
  return 'WGS84'
}

/**
 * 校车图层同步：每 5 秒拉取云一卡通校车快照（线路折线 + 起终点 + 实时车位置），
 * 喂给地图 provider 的 setBusRoutes/setBuses。
 *
 * 车位置按「沿线里程」平滑：每帧从当前显示位向前推进，里程只增不减，
 * 本趟没跑完不会回退（算法见 shared/utils/bus-track.ts）。卸载时清空图层。
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

  /** 每台车一条跟踪状态（busName → 渲染状态）。 */
  const renders = new Map<string, BusRender>()
  /** 上游把车临时挂到另一条线路时的待确认切换：连续两帧才换手，防单帧误报。 */
  const pendingRoute = new Map<string, { routeId: string, frames: number }>()
  let lastData: BusPositionsResponse | null = null

  function routeLine(route: BusRouteSnapshot): Array<{ lng: number, lat: number }> {
    const points = (route.polyline ?? []).filter(point => Number.isFinite(point.lng) && Number.isFinite(point.lat))
    if (points.length >= 2) return points.map(point => ({ lng: point.lng, lat: point.lat }))
    return route.stops
      .filter(stop => Number.isFinite(stop.lng) && Number.isFinite(stop.lat))
      .map(stop => ({ lng: stop.lng, lat: stop.lat }))
  }

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
   * 吸收一轮上报：只更新里程跟踪状态，不做显示。
   *
   * 上游 YKTGetBusCarInfo 是按 route_id 逐条线路查询的，返回的车就是这条线路
   * 上在跑的车，所以以它给的 routeId 为准；不再按「下一站得分」把车改判到
   * 反方向线路（改判后里程在反方向折线上是递减的，正是「二次定位后回退」的
   * 直接来源）。同一台车若重复上报，取投影偏离本线路最小的那条。
   */
  function ingest(data: BusPositionsResponse): void {
    const now = Date.now()
    const routeById = new Map(data.routes.map(route => [route.routeId, route]))
    const groups = new Map<string, BusSnapshot[]>()
    for (const bus of data.buses) {
      const list = groups.get(bus.busName)
      if (list) list.push(bus)
      else groups.set(bus.busName, [bus])
    }

    for (const [name, entries] of groups) {
      const currentRouteId = renders.get(name)?.track.routeId
      let best: BusCandidate | null = null
      let onCurrent: BusCandidate | null = null
      for (const bus of entries) {
        const route = routeById.get(bus.routeId)
        if (!route) continue
        const line = routeLine(route)
        if (line.length < 2) continue
        const snapped = snapToPolyline({ lng: bus.lng, lat: bus.lat }, line)
        if (!snapped) continue
        // 偏离线路太多 = 车不在本线路上（实测有校车全天停在东侧车场，离线路 2.9 km）。
        // 这种点不能当成本线路的位置，否则车标会画在线路上一个根本不存在的位置。
        if (snapped.offsetMeters > TRACK_OFF_ROUTE_M) continue
        const candidate: BusCandidate = {
          bus,
          route,
          line,
          along: alongOnPolyline(snapped.point, line),
          totalMeters: cumulativeDistances(line).at(-1) ?? 0,
          offsetMeters: snapped.offsetMeters
        }
        if (!best || candidate.offsetMeters < best.offsetMeters) best = candidate
        if (route.routeId === currentRouteId) onCurrent = candidate
      }
      if (!best) {
        // 本帧没有可用位置：先保留上一次位置（单帧 GPS 漂移不闪），连续 3 轮都不可用再撤掉。
        const previous = renders.get(name)
        pendingRoute.delete(name)
        if (!previous) continue
        const misses = previous.misses + 1
        if (misses >= 3) renders.delete(name)
        else renders.set(name, { ...previous, misses })
        continue
      }

      // 单帧换线不认：上游在终点附近偶尔把车同时挂在两条线路上，或者某帧只报另一条。
      // 车离旧线路很近时等第二帧再换趟；已经不在旧线路上（>150 m）就立刻换。
      if (currentRouteId && best.route.routeId !== currentRouteId) {
        const nearOld = !!onCurrent && onCurrent.offsetMeters <= TRACK_OFF_ROUTE_M
        if (nearOld) {
          const pending = pendingRoute.get(name)
          const frames = pending?.routeId === best.route.routeId ? pending.frames + 1 : 1
          pendingRoute.set(name, { routeId: best.route.routeId, frames })
          if (frames < 2) continue
        } else {
          pendingRoute.delete(name)
        }
      } else {
        pendingRoute.delete(name)
      }

      // 换趟那一帧要按新线路记账，里程从新线路起点重算。
      const { bus, route, line, totalMeters, offsetMeters, along } = best
      const previous = renders.get(name)?.track
      let track = previous
      if (!track) {
        track = createBusTrack(route.routeId, totalMeters, along, now)
      } else if (track.routeId !== route.routeId) {
        track = resetBusTrack(track, route.routeId, totalMeters, along, now)
      }
      observeBusTrack(track, { along, now, offsetMeters, atSite: bus.isAtSite })
      renders.set(name, {
        bus,
        route,
        line,
        along,
        totalMeters,
        offsetMeters,
        track,
        misses: 0
      })
    }

    // 整条响应里消失的车（跑完收车）也按 3 轮宽限再撤，避免上游偶发漏报导致车标闪一下。
    for (const [name, item] of [...renders]) {
      if (groups.has(name)) continue
      const misses = item.misses + 1
      if (misses >= 3) {
        renders.delete(name)
        pendingRoute.delete(name)
      } else {
        renders.set(name, { ...item, misses })
      }
    }
  }

  /**
   * 生成当前显示位：显示里程按动画帧向前推进，再反算成线路上的坐标。
   * 面板快照与地图 MapBus 用同一份坐标与车头朝向。
   */
  function buildDisplay(data: BusPositionsResponse): { snapshots: BusSnapshot[], mapBuses: MapBus[] } {
    const crs = toCrs(data.coordinateSystem)
    const now = Date.now()
    const activeRouteId = options.activeRouteId?.value ?? ''
    const snapshots: BusSnapshot[] = []
    const mapBuses: MapBus[] = []

    for (const [name, item] of renders) {
      const display = advanceBusTrack(item.track, now, item.bus.isAtSite)
      const sample = samplePolylinePoint(item.line, display)
      snapshots.push({
        ...item.bus,
        routeId: item.route.routeId,
        routeName: item.route.routeName,
        isBack: item.route.isBack,
        lng: sample.point.lng,
        lat: sample.point.lat
      })
      // 地图只画当前方向的车：否则车上地图了、简略图里没有（面板按方向过滤）。
      if (activeRouteId && item.route.routeId !== activeRouteId) continue
      mapBuses.push({
        id: name,
        name: item.bus.busName,
        point: { lng: sample.point.lng, lat: sample.point.lat, crs },
        isAtSite: item.bus.isAtSite,
        siteName: item.bus.siteName,
        routeName: item.route.routeName,
        updatedAt: item.bus.updatedAt,
        movedAt: item.track.lastAdvanceAt,
        // 折线按行驶方向排点，回程线路的切线本身就是车头方向，不再补 180°。
        angleDeg: sample.angleDeg
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

  /** 节拍推进插值显示位：每 150ms 用当前时间重算一次，两次轮询之间也连续移动。 */
  function tickMotion(): void {
    if (!lastData || stopped) return
    pushDisplay()
  }

  if (options.activeRouteId) {
    watch(options.activeRouteId, () => {
      const provider = options.mapProvider.value
      if (provider && lastData) provider.setBusRoutes(toRoutes(lastData))
      // 方向一切换，地图上的车也要立刻跟着换，否则地图留着另一方向的车。
      pushDisplay()
    })
  }

  async function refresh(): Promise<void> {
    try {
      const data = await $fetch<BusPositionsResponse>(BUS_POSITIONS_API_PATH)
      if (stopped) return
      lastData = data
      routes.value = data.routes
      fetchedAt.value = data.fetchedAt
      ingest(data)
      // 地图 provider 还没就绪时也要刷新面板数据（否则面板要等下一轮轮询才有车）。
      options.mapProvider.value?.setBusRoutes(toRoutes(data))
      pushDisplay()
    } catch {
      // 拉取失败静默跳过，下一轮重试（页面不因校车数据报错）。
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
    renders.clear()
    pendingRoute.clear()
    lastData = null
    options.mapProvider.value?.setBuses([])
    options.mapProvider.value?.setBusRoutes([])
    routes.value = []
    buses.value = []
    fetchedAt.value = null
  })

  return { refreshBusPositions: refresh, routes, buses, fetchedAt }
}
