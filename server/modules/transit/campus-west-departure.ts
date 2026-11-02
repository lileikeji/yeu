/**
 * 旧区实际发车点校准：YKT 给的起点是「旧区创业园」，实测车是从东苑餐厅门口的三叉路口发车。
 * 这里用高德驾车算路（东苑餐厅 → 旧区创业园）取第一段真实道路，作为线路的前置接驳段，
 * 并把起点站挪到该路口，避免线路从创业园「凭空起步」。
 * 坐标：YKT 与站点数据是 WGS84，高德要 GCJ-02，进出各转一次。
 */

import { gcj02ToWgs84, wgs84ToGcj02 } from '../../../shared/utils/coordinate-convert'
import { parseAmapPolyline } from '../directions/amap'

export interface LngLatPoint { lng: number, lat: number }

/** 东苑餐厅门口（WGS84，来自 amap-imported-places 的标点）。 */
export const WEST_GATE: LngLatPoint = { lng: 118.61284164, lat: 25.11585061 }
/** 旧区发车点站名（会替换掉 YKT 的「旧区创业园」）。 */
export const WEST_DEPARTURE_STOP_NAME = '旧区发车点（东苑三叉路口）'

interface WestApproach {
  /** 接驳段折线（WGS84，含起点）。 */
  polyline: LngLatPoint[]
  /** 接驳段起点＝新的发车点（WGS84）。 */
  start: LngLatPoint
  fetchedAt: number
}

let cache: WestApproach | null = null
let inflight: Promise<WestApproach | null> | null = null

async function fetchApproach(amapKey: string, destination: LngLatPoint): Promise<WestApproach | null> {
  const origin = wgs84ToGcj02(WEST_GATE.lng, WEST_GATE.lat)
  const target = wgs84ToGcj02(destination.lng, destination.lat)
  const url = 'https://restapi.amap.com/v3/direction/driving'
    + `?origin=${origin.longitude.toFixed(6)},${origin.latitude.toFixed(6)}`
    + `&destination=${target.longitude.toFixed(6)},${target.latitude.toFixed(6)}`
    + `&strategy=0&extensions=base&key=${amapKey}`
  const response = await fetch(url, { signal: AbortSignal.timeout(12_000) })
  if (!response.ok) return null
  const payload = await response.json() as { status?: string, route?: { paths?: Array<{ steps?: Array<{ polyline?: string }> }> } }
  const steps = payload.route?.paths?.[0]?.steps ?? []
  const points: LngLatPoint[] = []
  for (const step of steps) {
    for (const point of parseAmapPolyline(step.polyline ?? '')) {
      points.push({ lng: point.longitude, lat: point.latitude })
    }
  }
  if (points.length < 2) return null
  const wgs = points.map((point) => {
    const converted = gcj02ToWgs84(point.lng, point.lat)
    return { lng: converted.longitude, lat: converted.latitude }
  })
  // 接驳段首点吸附到东苑门口本身，坐标比算路起点更贴近实地。
  return { polyline: [{ ...WEST_GATE }, ...wgs.slice(1)], start: { ...WEST_GATE }, fetchedAt: Date.now() }
}

/** 取接驳段（24h 缓存；失败返回 null，线路退回原起点）。 */
export async function westApproach(amapKey: string, destination: LngLatPoint): Promise<WestApproach | null> {
  if (cache && Date.now() - cache.fetchedAt < 24 * 60 * 60 * 1000) return cache
  if (inflight) return inflight
  inflight = fetchApproach(amapKey, destination)
    .then((result) => {
      if (result) cache = result
      return result
    })
    .catch(() => null)
    .finally(() => {
      inflight = null
    })
  return inflight
}
