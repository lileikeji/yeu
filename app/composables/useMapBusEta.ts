import type { Ref } from 'vue'
import type { MapProvider } from '~~/map/core/provider'
import type { BusRouteSnapshot, BusSnapshot } from '~~/app/composables/useMapBusPositions'
import type { LineSpeedProfile } from '~~/shared/utils/bus-route-progress'
import { computed } from 'vue'
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

/** 最多同时显示几辆车，避免折叠态被胶囊铺满。 */
export const MAX_BUS_ETA_PILLS = 3
/** 右侧地图控件列（缩放 + 罗盘约 40px，含 10px 边距）之前留出的安全区。 */
const RIGHT_CONTROL_GUTTER_PX = 56
/** 胶囊最宽约 110px，按半宽兜底判断是否已经贴到右缘。 */
const PILL_HALF_WIDTH_PX = 56

/**
 * 分段实测车速切片按 routeId 缓存。
 * computed 每 150ms 随显示位重算一次，profile 只和线路几何有关，不能每次都重建。
 */
const profileCache = new Map<string, LineSpeedProfile | undefined>()

function resolveProfile(route: BusRouteSnapshot): LineSpeedProfile | undefined {
  if (profileCache.has(route.routeId))
    return profileCache.get(route.routeId)
  const stops = route.stops.map(stop => ({ lng: stop.lng, lat: stop.lat }))
  const polyline = (route.polyline ?? []).map(point => ({ lng: point.lng, lat: point.lat }))
  const profile = buildSegmentProfile(route.routeId, stops, polyline)
  profileCache.set(route.routeId, profile)
  return profile
}

/**
 * 把在途校车投影成屏幕坐标 ETA 分钟数。
 * ETA 口径与校车面板完全一致：computeBusProgress + buildSegmentProfile 分段实测车速，
 * 同一辆车在面板与胶囊上必须给出相同分钟数。
 * 投影走 provider.projectToScreen seam，未实现或尚未就绪时返回空数组。
 */
export function useMapBusEta(options: {
  buses: Ref<BusSnapshot[]>
  routes: Ref<BusRouteSnapshot[]>
  provider: Ref<MapProvider | null>
  /** 当前方向（线路 id）：反向车在面板里被过滤，这里也要过滤，否则出现没有车对应的孤儿胶囊。 */
  activeRouteId?: Ref<string>
  max?: number
}) {
  return computed<BusEtaPill[]>(() => {
    const provider = options.provider.value
    if (!provider || typeof provider.projectToScreen !== 'function')
      return []
    const routes = options.routes.value
    if (routes.length === 0 || options.buses.value.length === 0)
      return []
    const activeRouteId = options.activeRouteId?.value ?? ''
    const max = options.max ?? MAX_BUS_ETA_PILLS
    const pills: BusEtaPill[] = []
    for (const bus of options.buses.value) {
      if (pills.length >= max)
        break
      if (activeRouteId && bus.routeId !== activeRouteId)
        continue
      // 找不到本车线路就不猜：拿第一条线算 ETA 会把别的线路时间贴到这台车上。
      const route = routes.find(item => item.routeId === bus.routeId)
      if (!route || route.stops.length < 2)
        continue
      const screen = provider.projectToScreen({ lng: bus.lng, lat: bus.lat, crs: 'WGS84' })
      if (!screen)
        continue
      const stops = route.stops.map(stop => ({ lng: stop.lng, lat: stop.lat }))
      const polyline = (route.polyline ?? []).map(point => ({ lng: point.lng, lat: point.lat }))
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
      // 贴到右缘时把胶囊翻到车点左侧：maplibre 的缩放 / 罗盘控件组会盖住居中悬挂的胶囊。
      const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth
      const flipLeft = viewportWidth > 0 && screen.x + PILL_HALF_WIDTH_PX > viewportWidth - RIGHT_CONTROL_GUTTER_PX
      // 贴左缘时向右偏，别让居中悬挂的胶囊出血到屏幕外。
      const nearLeft = viewportWidth > 0 && screen.x - PILL_HALF_WIDTH_PX < 8
      pills.push({
        id: bus.busId,
        label: stopName ? `到${stopName}` : bus.busName,
        etaMinutes,
        x: Math.round(screen.x),
        y: Math.round(screen.y),
        transform: `translate3d(${Math.round(screen.x)}px, ${Math.round(screen.y)}px, 0) translate(${flipLeft ? 'calc(-100% - 10px)' : nearLeft ? '10px' : '-50%'}, calc(-100% - 10px))`
      })
    }
    return pills
  })
}
