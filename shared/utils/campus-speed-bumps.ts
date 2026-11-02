/**
 * 校园减速带（叮叮车/电瓶车实测 27 处，2026-11-02 现场标注）。
 *
 * 叮叮车规矩：过减速带要把速度压到几乎为 0，所以全程平均速度只有约 3.4 m/s，
 * 远低于道路巡航 6.4 m/s。这里把「减速带 → 局部限速」建成连续速度场，
 * 由 eta 计算沿线积分，避免用一个人为平均速糊掉弯道与减速带的差异。
 */

import { gcj02ToWgs84 } from './coordinate-convert'

export interface SpeedBump {
  id: number
  lng: number
  lat: number
}

/** 现场标注是在高德底图上量的，所以原始坐标是 GCJ-02。 */
export const CAMPUS_SPEED_BUMPS_GCJ02: SpeedBump[] = [
  { id: 1, lng: 118.603808, lat: 25.106439 },
  { id: 2, lng: 118.605103, lat: 25.106415 },
  { id: 3, lng: 118.606487, lat: 25.106233 },
  { id: 4, lng: 118.607207, lat: 25.107711 },
  { id: 5, lng: 118.607037, lat: 25.106500 },
  { id: 6, lng: 118.609222, lat: 25.109148 },
  { id: 7, lng: 118.609478, lat: 25.109119 },
  { id: 8, lng: 118.610937, lat: 25.108949 },
  { id: 9, lng: 118.607903, lat: 25.108714 },
  { id: 10, lng: 118.615243, lat: 25.110768 },
  { id: 11, lng: 118.614840, lat: 25.110449 },
  { id: 12, lng: 118.614920, lat: 25.110266 },
  { id: 13, lng: 118.614759, lat: 25.109980 },
  { id: 14, lng: 118.614524, lat: 25.109529 },
  { id: 15, lng: 118.613430, lat: 25.109302 },
  { id: 16, lng: 118.613935, lat: 25.109213 },
  { id: 17, lng: 118.614495, lat: 25.112515 },
  { id: 18, lng: 118.614388, lat: 25.111922 },
  { id: 19, lng: 118.615805, lat: 25.112706 },
  { id: 20, lng: 118.614744, lat: 25.112798 },
  { id: 21, lng: 118.615951, lat: 25.112692 },
  { id: 22, lng: 118.615459, lat: 25.112763 },
  { id: 23, lng: 118.616107, lat: 25.112831 },
  { id: 24, lng: 118.605212, lat: 25.104894 },
  { id: 25, lng: 118.606715, lat: 25.104769 },
  { id: 26, lng: 118.603534, lat: 25.104943 },
  { id: 27, lng: 118.606894, lat: 25.105961 }
]

/** 供路径计算用的 WGS-84 坐标（校车 GPS 与线路折线都是 WGS-84）。 */
export const CAMPUS_SPEED_BUMPS: SpeedBump[] = CAMPUS_SPEED_BUMPS_GCJ02.map((bump) => {
  const converted = gcj02ToWgs84(bump.lng, bump.lat)
  return { id: bump.id, lng: converted.longitude, lat: converted.latitude }
})

/** 道路巡航速度（m/s，约 23 km/h）。 */
export const CAMPUS_CRUISE_MPS = 6.4
/** 轮子压过减速带时的爬行速度（m/s，约 3.6 km/h；现场是「几乎停下」再挪过去）。 */
export const BUMP_CRAWL_MPS = 2.6
/** 减速带「带内」半径（米）：这圈里就是爬行速度。 */
export const BUMP_CRAWL_RADIUS_M = 9
/** 减速带外的刹车/加速过渡距离（米）：从爬行线性回到巡航。 */
export const BUMP_RAMP_M = 22
/** 减速带离行车轨迹多远仍算「会碾到」（米）。校车折线是 45 点抽稀的，放宽到 40 米。 */
export const BUMP_ON_LINE_RADIUS_M = 40
/** 带内爬行长度（米）：轮子真正跨过减速带的距离。 */
export const BUMP_CRAWL_LENGTH_M = 9
/** 单侧减速/加速距离（米）。 */
export const BUMP_APPROACH_M = 28
/** 减速/加速段的平均速度（m/s）。 */
export const BUMP_APPROACH_MPS = 5.2

/**
 * 碾过一处减速带的额外耗时（秒）：
 * 前后各 BUMP_APPROACH_M 米按 3.5 m/s 走、带内 BUMP_CRAWL_LENGTH_M 米按 1.6 m/s 走，
 * 再减掉「本来就按巡航走这段」的时间。
 */
export function bumpExtraSeconds(): number {
  const slowDistance = BUMP_CRAWL_LENGTH_M + 2 * BUMP_APPROACH_M
  const slowSeconds = BUMP_CRAWL_LENGTH_M / BUMP_CRAWL_MPS
    + (2 * BUMP_APPROACH_M) / BUMP_APPROACH_MPS
  return Math.max(0, slowSeconds - slowDistance / CAMPUS_CRUISE_MPS)
}
/** 实测全程均速（m/s，约 12 km/h）——仅作兜底显示，不用来算 ETA。 */
export const CAMPUS_AVERAGE_MPS = 3.4

const EARTH_RADIUS_M = 6_371_000

function toRadians(degrees: number): number {
  return degrees * Math.PI / 180
}

function metersBetween(a: { lng: number, lat: number }, b: { lng: number, lat: number }): number {
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

/** 到最近减速带的平面距离（米）；校园范围小，直接用等距投影足够。 */
export function distanceToNearestBump(point: { lng: number, lat: number }): number {
  const scale = Math.cos(toRadians(point.lat)) * 111_320
  let best = Number.POSITIVE_INFINITY
  for (const bump of CAMPUS_SPEED_BUMPS) {
    const dx = (point.lng - bump.lng) * scale
    const dy = (point.lat - bump.lat) * 110_540
    const meters = Math.hypot(dx, dy)
    if (meters < best) best = meters
  }
  return best
}

/**
 * 该点的局部限速（m/s）：带内爬行，带外 BUMP_RAMP_M 内线性加速到巡航。
 * 远离减速带时就是巡航速度。
 */
export function localSpeedMps(point: { lng: number, lat: number }): number {
  const meters = distanceToNearestBump(point)
  if (meters <= BUMP_CRAWL_RADIUS_M) return BUMP_CRAWL_MPS
  const t = (meters - BUMP_CRAWL_RADIUS_M) / BUMP_RAMP_M
  if (t >= 1) return CAMPUS_CRUISE_MPS
  return BUMP_CRAWL_MPS + (CAMPUS_CRUISE_MPS - BUMP_CRAWL_MPS) * t
}
