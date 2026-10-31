/**
 * 校车线路进度测算 —— 掌上公交式「距下一站约 X 米」。
 * 纯函数、无 IO，供 composable / 组件与单测共用。
 */

interface LngLat {
  lng: number
  lat: number
}

export interface BusProgress {
  /** 车位于 stops[segmentIndex] → stops[segmentIndex+1] 段内 */
  segmentIndex: number
  /** 段内进度 0..1（0=刚离开上一站，1=即将到下一站） */
  progress: number
  /** 贴近站点或 isAtSite 时为站点下标，否则 null */
  atStopIndex: number | null
  /** 下一站下标（终点站停靠时为终点自身） */
  nextStopIndex: number
  /** 沿线距下一站米数（到站时为 0） */
  distanceToNextStopMeters: number
  /** 沿线距终点米数 */
  distanceToDestinationMeters: number
  /** 前方还有几站（含下一站，不含当前所在站） */
  stopsRemaining: number
}

const EARTH_RADIUS_M = 6_371_000
/** 与站点距离小于此值视为「已到站」（GPS 有漂移，取站台尺度）。 */
const AT_STOP_RADIUS_M = 60

function toRadians(degrees: number): number {
  return degrees * Math.PI / 180
}

function haversineMeters(a: LngLat, b: LngLat): number {
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function cumulativeDistances(line: LngLat[]): number[] {
  const cumulative = [0]
  for (let i = 1; i < line.length; i++) {
    cumulative.push(cumulative[i - 1]! + haversineMeters(line[i - 1]!, line[i]!))
  }
  return cumulative
}

interface PolylineProjection {
  distanceAlong: number
  offsetMeters: number
}

/** 把点投影到折线上（逐段垂足、端点钳制），返回沿线里程与偏离距离。 */
function projectOntoPolyline(point: LngLat, line: LngLat[], cumulative: number[]): PolylineProjection {
  let best: PolylineProjection = { distanceAlong: 0, offsetMeters: Infinity }
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!
    const b = line[i + 1]!
    const segmentLength = cumulative[i + 1]! - cumulative[i]!
    // 段内平面近似（校园尺度足够）
    const cosLat = Math.cos(toRadians(a.lat))
    const abx = toRadians(b.lng - a.lng) * cosLat * EARTH_RADIUS_M
    const aby = toRadians(b.lat - a.lat) * EARTH_RADIUS_M
    const apx = toRadians(point.lng - a.lng) * cosLat * EARTH_RADIUS_M
    const apy = toRadians(point.lat - a.lat) * EARTH_RADIUS_M
    const lengthSquared = abx * abx + aby * aby
    const t = lengthSquared === 0
      ? 0
      : Math.min(1, Math.max(0, (apx * abx + apy * aby) / lengthSquared))
    const closest: LngLat = {
      lng: a.lng + (b.lng - a.lng) * t,
      lat: a.lat + (b.lat - a.lat) * t
    }
    const offsetMeters = haversineMeters(point, closest)
    if (offsetMeters < best.offsetMeters) {
      best = { distanceAlong: cumulative[i]! + t * segmentLength, offsetMeters }
    }
  }
  return best
}

/**
 * 计算车辆在线路上的进度。
 * @param bus 车辆 GPS（WGS84）
 * @param stops 线路站点（按行驶顺序）
 * @param polyline 沿路折线（WGS84）；不足 2 点时按站点直连回退
 * @param options.isAtSite 服务端「已到站」标记（优先于 GPS 贴近判定）
 */
export function computeBusProgress(
  bus: LngLat,
  stops: LngLat[],
  polyline: LngLat[],
  options: { isAtSite?: boolean } = {}
): BusProgress | null {
  if (stops.length < 2) return null
  const line = polyline.length >= 2 ? polyline : stops
  const cumulative = cumulativeDistances(line)

  // 各站沿线里程（投影后强制单调，防折线重复点抖动）
  const stopDistances: number[] = []
  let previous = -Infinity
  for (const stop of stops) {
    const projected = projectOntoPolyline(stop, line, cumulative).distanceAlong
    const distance = Math.max(projected, previous)
    stopDistances.push(distance)
    previous = distance
  }

  const destinationDistance = stopDistances[stopDistances.length - 1]!
  const busProjection = projectOntoPolyline(bus, line, cumulative)
  const busDistance = Math.min(
    Math.max(busProjection.distanceAlong, stopDistances[0]!),
    destinationDistance
  )

  // 已到站判定：API 状态优先，其次 GPS 贴近站点；车越过终点钳制为已到终点站
  let atStopIndex: number | null = null
  let nearestIndex = 0
  let nearestMeters = Infinity
  stops.forEach((stop, index) => {
    const meters = haversineMeters(bus, stop)
    if (meters < nearestMeters) {
      nearestMeters = meters
      nearestIndex = index
    }
  })
  if (options.isAtSite || nearestMeters <= AT_STOP_RADIUS_M) {
    atStopIndex = nearestIndex
  } else if (busProjection.distanceAlong >= destinationDistance) {
    atStopIndex = stops.length - 1
  }

  // 所在段与段内进度
  let segmentIndex = stops.length - 2
  for (let i = 0; i < stops.length - 1; i++) {
    if (busDistance <= stopDistances[i + 1]!) {
      segmentIndex = i
      break
    }
  }
  const segmentLength = stopDistances[segmentIndex + 1]! - stopDistances[segmentIndex]!
  const progress = segmentLength <= 0
    ? 0
    : Math.min(1, Math.max(0, (busDistance - stopDistances[segmentIndex]!) / segmentLength))

  const nextStopIndex = atStopIndex !== null
    ? Math.min(atStopIndex + 1, stops.length - 1)
    : segmentIndex + 1

  return {
    segmentIndex,
    progress,
    atStopIndex,
    nextStopIndex,
    distanceToNextStopMeters: atStopIndex !== null
      ? 0
      : Math.max(0, stopDistances[nextStopIndex]! - busDistance),
    distanceToDestinationMeters: Math.max(0, destinationDistance - busDistance),
    stopsRemaining: stops.length - 1 - (atStopIndex ?? segmentIndex)
  }
}
