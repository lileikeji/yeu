import type { GeoPoint, MapBusRoute, MapSpeedBump, MapTransitVehicle } from '~~/map/core/types'
import type { MapProvider } from '~~/map/core/provider'
import type {
  ApiBusDeparturesResponse,
  ApiBusLineDirection,
  ApiBusLinesResponse,
  ApiBusLiveResponse
} from '~~/shared/types/server'
import type { Ref } from 'vue'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { CAMPUS_SPEED_BUMPS } from '~~/shared/utils/campus-speed-bumps'
import { haversineMeters, snapToPolyline } from '~~/shared/utils/bus-route-progress'
import { wgs84ToGcj02 } from '~~/shared/utils/coordinate-convert'

interface MapTransitNotice {
  title: string
  description?: string
  color?: 'error'
}

interface UseMapTransitOptions {
  mapProvider: Ref<MapProvider | null>
  userLocation: Ref<GeoPoint | null>
  notify: (notice: MapTransitNotice) => void
}

/**
 * 地图的校车/校外公交图层：线路快照、实时车位置、减速带与底图注记。
 * 页面注入地图与定位，本 composable 持有图层状态并对外暴露模板要用的数据。
 */
export function useMapTransit(options: UseMapTransitOptions) {
  const { mapProvider, userLocation } = options

  // 校车图层：路线 + 起终点 + 实时车位置（云一卡通 5s 轮询）；快照数据喂掌上公交面板
  const busSelectedRouteId = ref('')
  const { routes: busRoutes, buses: busVehicles, fetchedAt: busFetchedAt } = useMapBusPositions({ mapProvider, activeRouteId: busSelectedRouteId })
  // 手机竖屏默认收起：展开时是全屏浮层，会把地图和搜索框一起盖住。
  const busPanelOpen = ref(typeof window === 'undefined' ? true : window.innerWidth >= 768)

  // 校外公交（K2/K6）：默认打开，静态快照，独立图层，不跟校车轮询重绘，也不影响校内校车线路
  const transitLinesOpen = ref(false)
  const transitPanelOpen = ref(false)
  const transitLoading = ref(false)
  const transitRoutes = shallowRef<MapBusRoute[]>([])
  const transitDirections = shallowRef<ApiBusLineDirection[]>([])
  const transitFetchedAt = ref<string | null>(null)
  const transitLive = shallowRef<ApiBusLiveResponse | null>(null)
  const transitDepartures = shallowRef<ApiBusDeparturesResponse | null>(null)
  const transitLiveError = ref('')
  /** 校园减速带：与校车 ETA 同一份数据，单独一层图标。 */
  const speedBumpPoints: MapSpeedBump[] = CAMPUS_SPEED_BUMPS.map(bump => ({
    id: `bump-${bump.id}`,
    label: String(bump.id),
    point: { lng: bump.lng, lat: bump.lat, crs: 'WGS84' as const }
  }))
  const speedBumpsVisible = ref(true)
  /** 底图自带 POI 注记默认关掉：只剩项目自己的建筑图标，画面才不糊。 */
  const basemapLabelsVisible = ref(false)

  /**
   * 减速带标点压到车行道中心：原始点位是现场标的，偏移几米就会浮在路外。
   * 按当前校车折线取最近点（25 米内才吸），没有折线时用原点位。
   */
  function snappedSpeedBumps(): MapSpeedBump[] {
    const lines = busRoutes.value
      .map(route => (route.polyline ?? []).map(point => ({ lng: point.lng, lat: point.lat })))
      .filter(line => line.length >= 2)
    if (!lines.length) return speedBumpPoints
    return speedBumpPoints.map((bump) => {
      let best: { point: { lng: number, lat: number }, offsetMeters: number } | null = null
      for (const line of lines) {
        const snapped = snapToPolyline({ lng: bump.point.lng, lat: bump.point.lat }, line)
        if (snapped && (!best || snapped.offsetMeters < best.offsetMeters)) best = snapped
      }
      if (!best || best.offsetMeters > 25) return bump
      return { ...bump, point: { ...bump.point, lng: best.point.lng, lat: best.point.lat } }
    })
  }

  function applySpeedBumps(provider = mapProvider.value): void {
    provider?.setSpeedBumps?.(speedBumpsVisible.value ? snappedSpeedBumps() : [])
    provider?.setBasemapLabels?.(basemapLabelsVisible.value)
  }

  function applyBasemapLabels(): void {
    mapProvider.value?.setBasemapLabels?.(basemapLabelsVisible.value)
  }

  watch(basemapLabelsVisible, () => applyBasemapLabels())

  function toggleBasemapLabels(): void {
    basemapLabelsVisible.value = !basemapLabelsVisible.value
  }

  function toggleSpeedBumps(): void {
    speedBumpsVisible.value = !speedBumpsVisible.value
    applySpeedBumps()
  }

  // 折线每 5 秒刷新一次，减速带跟着重新吸到路上（27 个点，开销可忽略）。
  watch(busRoutes, () => {
    if (speedBumpsVisible.value) applySpeedBumps()
  })

  /** 只显示某条线路（'all' = 全部）。 */
  const transitLineFilter = ref<string>('all')
  /** 只显示某个方向（空串 = 双向都画）。 */
  const transitSelectedDirection = ref<string>('')
  let transitLiveTimer: ReturnType<typeof setInterval> | null = null
  const TRANSIT_LINE_COLORS: Record<string, string> = { K2: '#1a6cf5', K6: '#e8590c' }

  function toTransitRoutes(data: ApiBusLinesResponse): MapBusRoute[] {
    return data.lines.map(line => ({
      id: `transit-${line.id}`,
      name: `${line.line} ${line.from}→${line.to}`,
      color: TRANSIT_LINE_COLORS[line.line] ?? '#1a6cf5',
      // 高德线路快照本身是 GCJ-02，别再让 provider 做一次 WGS84→GCJ-02 偏移
      polyline: line.polyline.map(([lng, lat]) => ({ lng, lat, crs: 'GCJ-02' as const })),
      stops: line.stops.map(stop => ({
        id: `transit-${line.id}-${stop.seq}`,
        name: stop.name,
        point: { lng: stop.lng, lat: stop.lat, crs: 'GCJ-02' as const },
        isOrigin: stop.seq === 1,
        isDestination: stop.seq === line.stops.length
      }))
    }))
  }

  async function toggleTransitLines(): Promise<void> {
    if (transitLinesOpen.value) {
      transitLinesOpen.value = false
      transitPanelOpen.value = false
      mapProvider.value?.setTransitRoutes?.([])
      stopTransitLive()
      mapProvider.value?.fitToPois()
      return
    }
    if (!await ensureTransitRoutesLoaded()) return
    transitLinesOpen.value = true
    transitPanelOpen.value = true
    mapProvider.value?.setTransitRoutes?.(visibleTransitRoutes.value)
    startTransitLive()
    focusTransitRoutes(visibleTransitRoutes.value)
  }

  /** 手机竖屏时两个面板都是全屏浮层，开一个就收另一个。 */
  function keepPanelsExclusive(next: 'bus' | 'transit'): void {
    if (typeof window === 'undefined' || window.innerWidth >= 768) return
    if (next === 'transit') busPanelOpen.value = false
    else transitPanelOpen.value = false
  }

  watch(transitPanelOpen, (open) => {
    if (open) keepPanelsExclusive('transit')
  })
  watch(busPanelOpen, (open) => {
    if (open) keepPanelsExclusive('bus')
  })

  function changeTransitLine(line: string): void {
    transitLineFilter.value = line
    transitSelectedDirection.value = ''
    mapProvider.value?.setTransitRoutes?.(visibleTransitRoutes.value)
    mapProvider.value?.setTransitVehicles?.(transitVehiclesForMap(transitLive.value))
    // 只看单条线路时把视野拉到这条线，否则车辆多半在校园视角外，看着像没有车
    if (line !== 'all') focusTransitRoutes(visibleTransitRoutes.value)
  }

  /** 点某个方向：只画这一条折线 + 这一条上的车；再点一次回到双向。 */
  function changeTransitDirection(line: ApiBusLineDirection): void {
    const same = transitSelectedDirection.value === line.id
    transitSelectedDirection.value = same ? '' : line.id
    transitLineFilter.value = same ? 'all' : line.line
    mapProvider.value?.setTransitRoutes?.(visibleTransitRoutes.value)
    mapProvider.value?.setTransitVehicles?.(transitVehiclesForMap(transitLive.value))
    if (visibleTransitRoutes.value.length) focusTransitRoutes(visibleTransitRoutes.value)
  }

  function distanceLabel(meters: number | undefined): string {
    if (meters === undefined || !Number.isFinite(meters)) return '—'
    if (meters <= 30) return '已到站'
    if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
    return `${Math.round(meters)} m`
  }

  function focusTransitStop(point: { lng: number, lat: number }): void {
    mapProvider.value?.flyToPoint({ ...point, crs: 'GCJ-02' }, 16)
  }

  /** 正在跟的车（点车后镜头一直跟着它，直到关掉详情）。 */
  interface VehicleFocus {
    plate: string
    point: [number, number]
    nextStation: string
    distanceToNext?: number
    updatedAt?: string
    source: 'transit' | 'campus'
    busId?: string
    /** 校内校车的线路方向（旧区--新区），留言列表里作上下文展示。 */
    routeName?: string
  }
  const transitVehicleFocus = ref<VehicleFocus | null>(null)
  /** 跟车时每秒刷新的 GPS 年龄（秒）。 */
  const transitGpsAge = ref(0)
  // 每台车「位置真的变了」的本地时刻；位置没变就不刷新，避免恒显示 0 秒前。
  const transitMoveStamps = new Map<string, { point: [number, number], at: number }>()
  watch(busVehicles, (list) => {
    for (const bus of list) stampTransitMove(bus.busName, [bus.lng, bus.lat])
  }, { deep: false })
  function stampTransitMove(plate: string, point: [number, number]): void {
    const last = transitMoveStamps.get(plate)
    // 12 m 以内算 GPS 抖动，不算「位置更新」，否则停站时也会一直显示 0 秒。
    const moved = !last
      || haversineMeters({ lng: last.point[0], lat: last.point[1] }, { lng: point[0], lat: point[1] }) > 12
    transitMoveStamps.set(plate, { point, at: moved ? Date.now() : last?.at ?? Date.now() })
  }
  let transitAgeTimer: ReturnType<typeof globalThis.setInterval> | null = null

  /** 点一辆车：镜头跟住它，并打开车辆详情（含 GPS 更新时间）。 */
  function focusTransitVehicle(payload: VehicleFocus): void {
    transitVehicleFocus.value = { ...payload }
    ensureAgeTimer()
    const converted = payload.source === 'campus' ? wgs84ToGcj02(payload.point[0], payload.point[1]) : null
    const target = converted
      ? { lng: converted.longitude, lat: converted.latitude }
      : { lng: payload.point[0], lat: payload.point[1] }
    mapProvider.value?.flyToPoint({ ...target, crs: 'GCJ-02' }, 17)
  }

  /** 关掉跟车卡片：同时停掉每秒计时。 */
  function closeVehicleDetails(): void {
    transitVehicleFocus.value = null
    if (transitAgeTimer) clearInterval(transitAgeTimer)
    transitAgeTimer = null
  }

  /** 面板里点车辆行：等同于点地图上的车标。 */
  function focusTransitVehicleFromPanel(payload: { plate: string, point: [number, number], nextStation: string, distanceToNext?: number }): void {
    focusTransitVehicle({ ...payload, source: 'transit', updatedAt: transitLive.value?.fetchedAt })
  }

  /** 地图上点车标：校外公交（transit:车牌）与校内校车（bus id）都走这里。 */
  function handleBusChipSelect(id: string): void {
    if (id.startsWith('transit:')) {
      const plate = id.slice('transit:'.length)
      const vehicle = (transitLive.value?.directions ?? [])
        .flatMap(direction => direction.vehicles)
        .find(item => item.plate === plate)
      if (!vehicle) return
      focusTransitVehicle({
        plate: vehicle.plate,
        point: vehicle.point,
        nextStation: vehicle.nextStation,
        distanceToNext: vehicle.distanceToNext,
        updatedAt: transitLive.value?.fetchedAt,
        source: 'transit'
      })
      return
    }
    const bus = busVehicles.value.find(item => item.busName === id)
    if (!bus) return
    focusTransitVehicle({
      plate: bus.busName,
      point: [bus.lng, bus.lat],
      nextStation: bus.siteName,
      updatedAt: bus.updatedAt,
      source: 'campus',
      busId: bus.busName,
      routeName: bus.routeName
    })
  }

  let busSelectOff: (() => void) | null = null
  watch(mapProvider, (provider) => {
    busSelectOff?.()
    busSelectOff = provider?.onBusSelect?.(handleBusChipSelect) ?? null
  }, { immediate: true })
  onBeforeUnmount(() => {
    busSelectOff?.()
    busSelectOff = null
  })

  /** 校车在动，跟车卡片跟着最新位置走（校外公交由 followTransitVehicle 负责）。 */
  watch(busVehicles, (list) => {
    const focus = transitVehicleFocus.value
    if (!focus || focus.source !== 'campus' || !focus.busId) return
    const bus = list.find(item => item.busName === focus.busId)
    if (!bus) return
    transitVehicleFocus.value = {
      ...focus,
      point: [bus.lng, bus.lat],
      nextStation: bus.siteName,
      updatedAt: bus.updatedAt
    }
    const moved = wgs84ToGcj02(bus.lng, bus.lat)
    // 只放大不缩小：用户手动放大后保持当前 zoom，没动过（或缩小到 17 以下）用 17 保底防跟丢。
    mapProvider.value?.flyToPoint(
      { lng: moved.longitude, lat: moved.latitude, crs: 'GCJ-02' },
      Math.max(mapProvider.value?.getZoom?.() ?? 17, 17)
    )
  }, { deep: false })

  let transitLoadPromise: Promise<boolean> | null = null

  /** 线路快照只拉一次；默认打开时靠它把图层铺上，失败只提示一次。 */
  const transitDirectionScope = computed(() => transitSelectedDirection.value
    ? transitDirections.value.find(item => item.id === transitSelectedDirection.value) ?? null
    : null)

  function sameStation(a: string, b: string): boolean {
    return a === b || a.includes(b) || b.includes(a)
  }

  const visibleTransitRoutes = computed(() => {
    const byLine = transitLineFilter.value === 'all'
      ? transitRoutes.value
      : transitRoutes.value.filter(route => route.name.startsWith(`${transitLineFilter.value} `))
    const scope = transitDirectionScope.value
    if (!scope) return byLine
    return byLine.filter(route => route.id === `transit-${scope.id}`)
  })

  function transitVehiclesForMap(data: ApiBusLiveResponse | null): MapTransitVehicle[] {
    if (!data) return []
    const filter = transitLineFilter.value
    const scope = transitDirectionScope.value
    const directions = (filter === 'all' ? data.directions : data.directions.filter(item => item.line === filter))
      .filter(item => !scope
        || (item.line === scope.line && sameStation(item.from, scope.from) && sameStation(item.to, scope.to)))
    // 车辆 GPS 与折线同源（掌上公交），但仍有几米抖动：吸附到本方向折线上，
    // 车头按折线切线走，看起来就是沿着路开。
    const lineByName = new Map<string, Array<{ lng: number, lat: number }>>()
    for (const route of transitRoutes.value) {
      const line = (route.polyline ?? []).map(point => ({ lng: point.lng, lat: point.lat }))
      if (line.length >= 2) lineByName.set(route.name, line)
    }
    return directions.flatMap((direction) => {
      const line = lineByName.get(`${direction.line} ${direction.from} → ${direction.to}`)
        ?? [...lineByName.entries()].find(([name]) => name.startsWith(`${direction.line} `) && name.includes(direction.from))?.[1]
      return direction.vehicles.map((vehicle, index) => {
        const snapped = line ? snapToPolyline({ lng: vehicle.point[0], lat: vehicle.point[1] }, line) : null
        const point = snapped && snapped.offsetMeters <= 40 ? snapped.point : { lng: vehicle.point[0], lat: vehicle.point[1] }
        const angleDeg = line
          ? (snapToPolyline({ lng: point.lng, lat: point.lat }, line)?.angleDeg ?? vehicle.angle)
          : vehicle.angle
        return {
          id: `${direction.line}-${direction.direction}-${vehicle.plate || index}`,
          line: direction.line,
          plate: vehicle.plate,
          nextStation: vehicle.nextStation,
          color: TRANSIT_LINE_COLORS[direction.line] ?? '#1a6cf5',
          angleDeg,
          point: { lng: point.lng, lat: point.lat, crs: 'GCJ-02' as const }
        }
      })
    })
  }

  /** 车辆走掌上公交的实时接口，20 秒一轮；只有图层打开时才轮询。 */
  async function refreshTransitLive(): Promise<void> {
    try {
      transitLive.value = await fetchTransit<ApiBusLiveResponse>('/api/public/transit/live')
      transitLiveError.value = ''
    } catch (error) {
      transitLiveError.value = (error as Error)?.message || '实时车辆暂时取不到'
    }
    if (transitLinesOpen.value) {
      mapProvider.value?.setTransitVehicles?.(transitVehiclesForMap(transitLive.value))
    }
    followTransitVehicle()
  }

  /** 跟车：每轮实时数据里找出同一块车牌，把镜头贴到它身上并刷新详情。 */
  function followTransitVehicle(): void {
    const focus = transitVehicleFocus.value
    if (!focus || focus.source !== 'transit') return
    const vehicle = (transitLive.value?.directions ?? [])
      .flatMap(direction => direction.vehicles)
      .find(item => item.plate === focus.plate)
    if (!vehicle) return
    transitVehicleFocus.value = {
      plate: vehicle.plate,
      point: vehicle.point,
      nextStation: vehicle.nextStation,
      distanceToNext: vehicle.distanceToNext,
      updatedAt: transitLive.value?.fetchedAt,
      source: 'transit'
    }
    // 只放大不缩小（同校内校车跟车）：保持用户手动放大的 zoom，保底 17 防跟丢。
    mapProvider.value?.flyToPoint(
      { lng: vehicle.point[0], lat: vehicle.point[1], crs: 'GCJ-02' },
      Math.max(mapProvider.value?.getZoom?.() ?? 17, 17)
    )
  }

  async function loadTransitDepartures(): Promise<void> {
    if (transitDepartures.value) return
    try {
      transitDepartures.value = await fetchTransit<ApiBusDeparturesResponse>('/api/public/transit/departures')
    } catch {
      // 时刻表拿不到只影响文字展示
    }
  }

  /** 跟车卡片里的「GPS 更新」：每秒按数据源自带时间重算，跟车结束就停。 */
  function ensureAgeTimer(): void {
    if (transitAgeTimer) return
    transitAgeTimer = globalThis.setInterval(() => {
      const focus = transitVehicleFocus.value
      if (!focus) return
      // 校车是快照时间（5 s 一轮），校外公交是拉取时间（20 s 一轮）。
      const iso = focus.source === 'campus'
        ? focus.updatedAt
        : (transitLive.value?.fetchedAt ?? focus.updatedAt)
      const at = Date.parse(iso ?? '')
      transitGpsAge.value = Number.isFinite(at) ? Math.max(0, Math.round((Date.now() - at) / 1000)) : 0
    }, 1000)
  }

  function startTransitLive(): void {
    void loadTransitDepartures()
    ensureAgeTimer()
    void refreshTransitLive()
    if (transitLiveTimer) return
    transitLiveTimer = setInterval(() => {
      void refreshTransitLive()
    }, 20_000)
  }

  function stopTransitLive(): void {
    if (transitLiveTimer) clearInterval(transitLiveTimer)
    transitLiveTimer = null
    if (transitAgeTimer) clearInterval(transitAgeTimer)
    transitAgeTimer = null
    transitVehicleFocus.value = null
    mapProvider.value?.setTransitVehicles?.([])
  }

  async function ensureTransitRoutesLoaded(): Promise<boolean> {
    if (transitRoutes.value.length) return true
    if (!transitLoadPromise) {
      transitLoading.value = true
      transitLoadPromise = fetchTransit<ApiBusLinesResponse>('/api/public/transit/lines')
        .then((data) => {
          transitRoutes.value = toTransitRoutes(data)
          transitDirections.value = data.lines
          transitFetchedAt.value = data.fetchedAt
          return true
        })
        .catch(() => {
          transitLoadPromise = null
          options.notify({ title: '公交线路加载失败', description: '稍后再试，或先到「交通指南」看线路图。', color: 'error' })
          return false
        })
        .finally(() => {
          transitLoading.value = false
        })
    }
    return transitLoadPromise
  }

  /** 打开图层时把视野拉到线路走廊，否则校园视角里只会看到起点站一个点。 */
  function focusTransitRoutes(routes: MapBusRoute[]): void {
    const points = routes.flatMap(route => route.polyline?.length ? route.polyline : route.stops.map(stop => stop.point))
    if (!points.length) return
    let minLng = Infinity
    let maxLng = -Infinity
    let minLat = Infinity
    let maxLat = -Infinity
    for (const point of points) {
      if (point.lng < minLng) minLng = point.lng
      if (point.lng > maxLng) maxLng = point.lng
      if (point.lat < minLat) minLat = point.lat
      if (point.lat > maxLat) maxLat = point.lat
    }
    const span = Math.max(maxLng - minLng, (maxLat - minLat) * 1.4)
    const zoom = span > 1.2 ? 9 : span > 0.6 ? 10 : span > 0.3 ? 11 : span > 0.15 ? 12 : 13
    mapProvider.value?.flyToPoint({ lng: (minLng + maxLng) / 2, lat: (minLat + maxLat) / 2, crs: 'GCJ-02' }, zoom)
  }

  // 底图就绪 / 重建后补画；默认打开时先把快照拉下来（不移动相机，保持校园视角）
  watch(mapProvider, (provider) => {
    applySpeedBumps(provider)
  }, { immediate: true })

  watch(mapProvider, async (provider) => {
    if (!provider || !transitLinesOpen.value) return
    const loaded = await ensureTransitRoutesLoaded()
    if (!loaded || !transitLinesOpen.value) return
    provider.setTransitRoutes?.(visibleTransitRoutes.value)
    provider.setTransitVehicles?.(transitVehiclesForMap(transitLive.value))
  }, { immediate: true })

  // 掌上公交的站点是 GCJ-02，浏览器定位是 WGS84：先转再算「我在哪一站」。
  const transitMyLocation = computed(() => {
    const point = userLocation.value
    if (!point) return null
    if (point.crs === 'GCJ-02') return { lng: point.lng, lat: point.lat }
    const converted = wgs84ToGcj02(point.lng, point.lat)
    return { lng: converted.longitude, lat: converted.latitude }
  })
  return {
    busSelectedRouteId,
    busPanelOpen,
    busRoutes,
    busVehicles,
    busFetchedAt,
    transitLinesOpen,
    transitPanelOpen,
    transitLoading,
    transitDirections,
    transitFetchedAt,
    transitLive,
    transitDepartures,
    transitLiveError,
    transitSelectedDirection,
    transitVehicleFocus,
    transitGpsAge,
    transitMyLocation,
    speedBumpsVisible,
    basemapLabelsVisible,
    toggleBasemapLabels,
    toggleSpeedBumps,
    toggleTransitLines,
    changeTransitLine,
    changeTransitDirection,
    distanceLabel,
    focusTransitStop,
    focusTransitVehicleFromPanel,
    closeVehicleDetails,
    startTransitLive,
    stopTransitLive
  }
}
