import type { Ref } from 'vue'
import type { MapProvider } from '~~/map/core/provider'
import type { BusRouteSnapshot, BusSnapshot } from '~~/app/composables/useMapBusPositions'
import type { LineSpeedProfile } from '~~/shared/utils/bus-route-progress'
import { computed, shallowRef, watch } from 'vue'
import { computeBusProgress } from '~~/shared/utils/bus-route-progress'
import { buildSegmentProfile } from '~~/shared/utils/bus-segment-speeds'

/** 地图上的校车 ETA 胶囊（折叠态浮层用）。 */
interface BusEtaPill {
  id: string
  label: string
  etaMinutes: number
  x: number
  y: number
  /** 屏幕位移（含上移让开胶囊自身高度）。 */
  transform: string
}

type LngLat = { lng: number, lat: number }
type ScreenPoint = { x: number, y: number }

/** 最多同时显示几辆车，避免折叠态被胶囊铺满。 */
export const MAX_BUS_ETA_PILLS = 3
/** 右侧地图控件列（缩放 + 罗盘约 40px，含 10px 边距）之前留出的安全区。 */
export const RIGHT_CONTROL_GUTTER_PX = 56
/** 胶囊最宽约 110px，按半宽兜底判断是否已经贴到右缘。 */
const PILL_HALF_WIDTH_PX = 56

/**
 * 分段实测车速切片按 routeId 缓存。
 * computed 每 150ms 随显示位重算一次，profile 只和线路几何有关，不能每次都重建。
 */
const profileCache = new Map<string, LineSpeedProfile | undefined>()

/**
 * T-031 B4：线路几何（只留 lng/lat 的精简数组）按线路对象缓存。
 * 旧实现每个 tick 对每辆车重建两次 map，投影循环里凭空多出几十个临时对象；
 * 线路对象在两次轮询之间是同一个引用，WeakMap 命中即零分配，轮询换新对象后自动失效。
 */
const geometryCache = new WeakMap<BusRouteSnapshot, { stops: LngLat[], polyline: LngLat[] }>()

function resolveGeometry(route: BusRouteSnapshot): { stops: LngLat[], polyline: LngLat[] } {
  const cached = geometryCache.get(route)
  if (cached) return cached
  const geometry = {
    stops: route.stops.map(stop => ({ lng: stop.lng, lat: stop.lat })),
    polyline: (route.polyline ?? []).map(point => ({ lng: point.lng, lat: point.lat }))
  }
  geometryCache.set(route, geometry)
  return geometry
}

function resolveProfile(route: BusRouteSnapshot): LineSpeedProfile | undefined {
  if (profileCache.has(route.routeId)) return profileCache.get(route.routeId)
  const { stops, polyline } = resolveGeometry(route)
  const profile = buildSegmentProfile(route.routeId, stops, polyline)
  profileCache.set(route.routeId, profile)
  return profile
}

/**
 * 车点屏幕坐标 → 胶囊 transform。
 * 贴到右缘时翻到车点左侧（maplibre 缩放 / 罗盘控件组会盖住居中悬挂的胶囊）；
 * 贴左缘时向右偏，别让胶囊出血到屏幕外。
 * 抽成纯函数是为了让逐帧定位器与首帧渲染共用同一套贴边规则，两边不会漂。
 */
export function resolveBusEtaPillTransform(screen: ScreenPoint, viewportWidth: number): string {
  const flipLeft = viewportWidth > 0 && screen.x + PILL_HALF_WIDTH_PX > viewportWidth - RIGHT_CONTROL_GUTTER_PX
  const nearLeft = viewportWidth > 0 && screen.x - PILL_HALF_WIDTH_PX < 8
  return `translate3d(${Math.round(screen.x)}px, ${Math.round(screen.y)}px, 0) translate(${flipLeft ? 'calc(-100% - 10px)' : nearLeft ? '10px' : '-50%'}, calc(-100% - 10px))`
}

function viewportWidth(): number {
  return typeof window === 'undefined' ? 0 : window.innerWidth
}

/**
 * 把在途校车投影成屏幕坐标 ETA 分钟数。
 * ETA 口径与校车面板完全一致：computeBusProgress + buildSegmentProfile 分段实测车速，
 * 同一辆车在面板与胶囊上必须给出相同分钟数。
 * 投影走 provider.projectToScreen seam，未实现或尚未就绪时返回空数组。
 *
 * frozen 为真时（面板拖动 / 高度过渡中）返回上一帧快照：文本与首帧位移都不再重算，
 * 逐帧位移交给 useMapBusEtaPositioner 直接写 style，Vue 不再参与每帧 patch。
 */
export function useMapBusEta(options: {
  buses: Ref<BusSnapshot[]>
  routes: Ref<BusRouteSnapshot[]>
  provider: Ref<MapProvider | null>
  /** 当前方向（线路 id）：反向车在面板里被过滤，这里也要过滤，否则出现没有车对应的孤儿胶囊。 */
  activeRouteId?: Ref<string>
  /** 交互期间冻结文案与首帧位移，避免 150ms 一次的响应式 patch 撞上拖动帧。 */
  frozen?: Ref<boolean>
  max?: number
}) {
  const live = computed<BusEtaPill[]>(() => {
    const provider = options.provider.value
    if (!provider || typeof provider.projectToScreen !== 'function') return []
    const routes = options.routes.value
    if (routes.length === 0 || options.buses.value.length === 0) return []
    const activeRouteId = options.activeRouteId?.value ?? ''
    const max = options.max ?? MAX_BUS_ETA_PILLS
    const width = viewportWidth()
    const pills: BusEtaPill[] = []
    for (const bus of options.buses.value) {
      if (pills.length >= max) break
      if (activeRouteId && bus.routeId !== activeRouteId) continue
      // 找不到本车线路就不猜：拿第一条线算 ETA 会把别的线路时间贴到这台车上。
      const route = routes.find(item => item.routeId === bus.routeId)
      if (!route || route.stops.length < 2) continue
      const screen = provider.projectToScreen({ lng: bus.lng, lat: bus.lat, crs: 'WGS84' })
      if (!screen) continue
      const { stops, polyline } = resolveGeometry(route)
      const progress = computeBusProgress(
        { lng: bus.lng, lat: bus.lat },
        stops,
        polyline,
        { isAtSite: bus.isAtSite, profile: resolveProfile(route) }
      )
      const etaMinutes = progress && progress.etaSeconds > 0
        ? Math.max(1, Math.ceil(progress.etaSeconds / 60))
        : 0
      const nextStopName = progress
        ? (route.stops[progress.nextStopIndex]?.siteName ?? '')
        : ''
      const stopName = nextStopName || bus.siteName || ''
      pills.push({
        id: bus.busId,
        label: stopName ? `到${stopName}` : bus.busName,
        etaMinutes,
        x: Math.round(screen.x),
        y: Math.round(screen.y),
        transform: resolveBusEtaPillTransform(screen, width)
      })
    }
    return pills
  })

  const frozen = options.frozen
  if (!frozen) return live

  const snapshot = shallowRef<BusEtaPill[]>(live.value)
  // 源里先看 frozen：冻结期直接返回 null，连 live 的 computed 都不求值（否则拖动时每 tick 仍在算投影与 ETA）。
  watch(() => (frozen.value ? null : live.value), (value) => {
    if (value) snapshot.value = value
  }, { flush: 'sync' })
  // 解冻后可能错过一次 tick：立刻补拍一张，避免文案停在拖动前。
  watch(frozen, (value) => {
    if (!value) snapshot.value = live.value
  }, { flush: 'sync' })
  return snapshot
}

export interface BusEtaPillPositioner {
  /** 立刻同步一次（首帧 / 冻结解除时用）。 */
  syncOnce: () => void
  start: () => void
  stop: () => void
}

/**
 * T-031 B4：胶囊逐帧定位器。
 *
 * 旧实现把位移绑在 150ms 的车辆 tick 上：地图一旦被拖动，车点每帧都在动，
 * 胶囊却每 150ms 才挪一次，实测落后 64.9px（spec §4 的「跟手」要求 ≤2px）。
 * 这里用 rAF 每帧读一次投影、直接写 el.style.transform：
 * 不触发 Vue patch、不重算 ETA 文本，位移与车点同帧。
 */
export function useMapBusEtaPositioner(options: {
  layer: Ref<HTMLElement | null>
  pills: Ref<BusEtaPill[]>
  buses: Ref<BusSnapshot[]>
  provider: Ref<MapProvider | null>
  enabled: Ref<boolean>
}): BusEtaPillPositioner {
  let rafId = 0
  let running = false

  function syncOnce(): void {
    const layer = options.layer.value
    const provider = options.provider.value
    if (!layer || !provider || typeof provider.projectToScreen !== 'function') return
    if (!options.enabled.value) return
    const pills = options.pills.value
    if (pills.length === 0) return
    const buses = options.buses.value
    const width = viewportWidth()
    const nodes = layer.querySelectorAll<HTMLElement>('[data-bus-eta-id]')
    for (const node of nodes) {
      const busId = node.dataset.busEtaId
      if (!busId) continue
      const bus = buses.find(item => item.busId === busId)
      if (!bus) continue
      const screen = provider.projectToScreen({ lng: bus.lng, lat: bus.lat, crs: 'WGS84' })
      if (!screen) continue
      const next = resolveBusEtaPillTransform(screen, width)
      if (node.style.transform !== next) node.style.transform = next
    }
  }

  function tick(): void {
    if (!running) return
    syncOnce()
    rafId = globalThis.requestAnimationFrame(tick)
  }

  function start(): void {
    // SSR / Node 没有 rAF：setup 期的 immediate watch 会走到这里，直接跳过。
    if (typeof globalThis.requestAnimationFrame !== 'function') return
    if (running || !options.enabled.value) return
    running = true
    rafId = globalThis.requestAnimationFrame(tick)
  }

  function stop(): void {
    running = false
    if (rafId) globalThis.cancelAnimationFrame(rafId)
    rafId = 0
  }

  return { syncOnce, start, stop }
}
