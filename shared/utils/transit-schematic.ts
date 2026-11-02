/**
 * 校外公交（K2/K6）简略图：把站点、在途车辆与「我」投影到同一条沿线里程轴上。
 * 只做平面近似（站点间按直线累加），用于小窗示意，不用于导航。
 */

import { STATION_DWELL_SECONDS } from './bus-route-progress'
import { CAMPUS_CRUISE_MPS } from './campus-speed-bumps'

export interface SchematicPoint {
  lng: number
  lat: number
}

const R = 6_371_000
const RAD = Math.PI / 180

export function metersBetween(a: SchematicPoint, b: SchematicPoint): number {
  const dLat = (b.lat - a.lat) * RAD
  const dLng = (b.lng - a.lng) * RAD
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** 各站沿线里程（米），首站 0。 */
export function stopAlongs(stops: SchematicPoint[]): number[] {
  const alongs: number[] = []
  let total = 0
  stops.forEach((stop, index) => {
    if (index > 0) total += metersBetween(stops[index - 1]!, stop)
    alongs.push(total)
  })
  return alongs
}

/** 把一个点投影到折线上，返回沿线里程与离折线的垂直距离（米）。 */
export function projectAlong(point: SchematicPoint, stops: SchematicPoint[], alongs: number[]): { along: number, offset: number } {
  if (stops.length === 0) return { along: 0, offset: Number.POSITIVE_INFINITY }
  if (stops.length === 1) return { along: 0, offset: metersBetween(point, stops[0]!) }
  let best = { along: 0, offset: Number.POSITIVE_INFINITY }
  for (let index = 0; index < stops.length - 1; index += 1) {
    const from = stops[index]!
    const to = stops[index + 1]!
    const segLength = metersBetween(from, to) || 1
    // 以起点为原点的局部平面坐标（米）。
    const kx = 111_320 * Math.cos(from.lat * RAD)
    const ky = 110_540
    const ax = (to.lng - from.lng) * kx
    const ay = (to.lat - from.lat) * ky
    const px = (point.lng - from.lng) * kx
    const py = (point.lat - from.lat) * ky
    const t = Math.max(0, Math.min(1, (px * ax + py * ay) / (ax * ax + ay * ay || 1)))
    const projX = ax * t
    const projY = ay * t
    const offset = Math.hypot(px - projX, py - projY)
    if (offset < best.offset) best = { along: alongs[index]! + segLength * t, offset }
  }
  return best
}

/** 在途车辆沿线里程：下一站索引 + 到下一站余量反推。 */
export function vehicleAlong(nextStopIndex: number, distanceToNext: number | undefined, alongs: number[]): number {
  if (alongs.length === 0) return 0
  const index = Math.max(1, Math.min(alongs.length - 1, nextStopIndex))
  const segStart = alongs[index - 1]!
  const segLength = Math.max(1, alongs[index]! - segStart)
  const remain = Math.max(0, Math.min(segLength, distanceToNext ?? segLength))
  return segStart + (segLength - remain)
}

/** 到站时间：剩余里程 ÷ 平均速度 + 途经站停靠时间。 */
export function etaSeconds(fromAlong: number, toAlong: number, options: { speedMps?: number, stopSeconds?: number, stopsBetween?: number } = {}): number {
  const speed = options.speedMps ?? CAMPUS_CRUISE_MPS
  const stopSeconds = options.stopSeconds ?? STATION_DWELL_SECONDS
  const gap = Math.max(0, toAlong - fromAlong)
  return gap / speed + (options.stopsBetween ?? 0) * stopSeconds
}

export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '已到站'
  const minutes = Math.max(1, Math.round(seconds / 60))
  return `${minutes} 分钟`
}
