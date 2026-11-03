/**
 * 校车线路进度测算 —— 掌上公交式「距下一站约 X 米 / 约 X 分钟」。
 * 纯函数、无 IO，供 composable / 组件与单测共用。
 */

import { BUMP_ON_LINE_RADIUS_M, CAMPUS_AVERAGE_MPS, CAMPUS_CRUISE_MPS, CAMPUS_SPEED_BUMPS, bumpExtraSeconds } from './campus-speed-bumps'

interface LngLat {
  lng: number
  lat: number
}

/**
 * 兜底均速（m/s，约 12 km/h）。实测 2026-11-02：全程 2.46km 平时 10-12 分钟。
 *
 * ETA 不再直接用这个常数——叮叮车过减速带要压到近 0，平均慢是被 27 处减速带拖下来的，
 * 详细算在 travelSecondsOnLine() 里按「减速带局部限速」沿线积分；本值只用于没有几何数据时的兜底。
 */
export const BUS_SPEED_MPS = CAMPUS_AVERAGE_MPS

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
  /** 车投影点沿线里程（米，自折线起点起算） */
  distanceAlong: number
  /** 各站沿线里程（与 stops 同序，已强制单调） */
  stopDistancesAlong: number[]
  /** 到下一站预计秒数 = distanceToNextStopMeters / speedMps */
  etaSeconds: number
  /** 车头朝向（正北 0°，顺时针；折线退化为站点直连时仍给段向角） */
  angleDeg: number
}

const EARTH_RADIUS_M = 6_371_000
/** 与站点距离小于此值视为「已到站」（GPS 有漂移，取站台尺度）。 */
const AT_STOP_RADIUS_M = 60

function toRadians(degrees: number): number {
  return degrees * Math.PI / 180
}

export function haversineMeters(a: LngLat, b: LngLat): number {
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

/** 段方位角：正北 0°、顺时针 0..360；退化段返回 0。 */
export function bearingDegrees(a: LngLat, b: LngLat): number {
  return segmentBearing(a, b)
}

function segmentBearing(a: LngLat, b: LngLat): number {
  const dLat = b.lat - a.lat
  const dLng = (b.lng - a.lng) * Math.cos(toRadians(a.lat))
  if (dLat === 0 && dLng === 0) return 0
  return (Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360
}

/**
 * 把点吸到折线上最近的一点（校园尺度用平面近似足够）。
 * 返回吸附后的坐标与偏离距离；折线不足两点返回 null。
 * 站点、减速带标点都用它压到路面中心，避免图标浮在路外。
 */
export function snapToPolyline(point: LngLat, line: LngLat[]): { point: LngLat, offsetMeters: number, angleDeg: number } | null {
  if (line.length < 2) return null
  const cumulative = cumulativeDistances(line)
  let bestOffset = Infinity
  let bestPoint: LngLat | null = null
  let bestAngle = 0
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!
    const b = line[i + 1]!
    const cosLat = Math.cos(toRadians(a.lat))
    const abx = toRadians(b.lng - a.lng) * cosLat * EARTH_RADIUS_M
    const aby = toRadians(b.lat - a.lat) * EARTH_RADIUS_M
    const apx = toRadians(point.lng - a.lng) * cosLat * EARTH_RADIUS_M
    const apy = toRadians(point.lat - a.lat) * EARTH_RADIUS_M
    const lengthSquared = abx * abx + aby * aby
    const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, (apx * abx + apy * aby) / lengthSquared))
    const closest: LngLat = { lng: a.lng + (b.lng - a.lng) * t, lat: a.lat + (b.lat - a.lat) * t }
    const offset = haversineMeters(point, closest)
    if (offset < bestOffset) {
      bestOffset = offset
      bestPoint = closest
      bestAngle = bearingDegrees(a, b)
    }
  }
  return bestPoint ? { point: bestPoint, offsetMeters: bestOffset, angleDeg: bestAngle } : null
}

export function cumulativeDistances(line: LngLat[]): number[] {
  const cumulative = [0]
  for (let i = 1; i < line.length; i++) {
    cumulative.push(cumulative[i - 1]! + haversineMeters(line[i - 1]!, line[i]!))
  }
  return cumulative
}

interface PolylineProjection {
  distanceAlong: number
  offsetMeters: number
  angleDeg: number
}

/** 把点投影到折线上（逐段垂足、端点钳制），返回沿线里程、偏离距离与所在段朝向。 */
function projectOntoPolyline(point: LngLat, line: LngLat[], cumulative: number[]): PolylineProjection {
  let best: PolylineProjection = { distanceAlong: 0, offsetMeters: Infinity, angleDeg: 0 }
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
      best = {
        distanceAlong: cumulative[i]! + t * segmentLength,
        offsetMeters,
        angleDeg: segmentBearing(a, b)
      }
    }
  }
  return best
}

function resolveLine(stops: LngLat[], polyline: LngLat[]): LngLat[] {
  return polyline.length >= 2 ? polyline : stops
}

/** 各站沿线里程（投影后强制单调，防折线重复点抖动）。 */
function stopDistancesOnLine(stops: LngLat[], line: LngLat[], cumulative: number[]): number[] {
  const stopDistances: number[] = []
  let previous = -Infinity
  for (const stop of stops) {
    const projected = projectOntoPolyline(stop, line, cumulative).distanceAlong
    const distance = Math.max(projected, previous)
    stopDistances.push(distance)
    previous = distance
  }
  return stopDistances
}


/** 沿线里程取点（内部用，比 samplePolylinePoint 轻量）。 */
function pointAtDistance(line: LngLat[], cumulative: number[], distanceAlong: number): LngLat {
  const total = cumulative[cumulative.length - 1] ?? 0
  const d = Math.max(0, Math.min(total, distanceAlong))
  for (let i = 1; i < line.length; i++) {
    if (cumulative[i]! >= d) {
      const a = line[i - 1]!
      const b = line[i]!
      const span = cumulative[i]! - cumulative[i - 1]! || 1
      const t = (d - cumulative[i - 1]!) / span
      return { lng: a.lng + (b.lng - a.lng) * t, lat: a.lat + (b.lat - a.lat) * t }
    }
  }
  return { ...(line[line.length - 1] ?? { lng: 0, lat: 0 }) }
}

/** 每站上下客停留时间（秒）：实测含停站均速 3.4 m/s 与纯行驶 4 m/s 的差额主要在这里。 */
export const STATION_DWELL_SECONDS = 60

/** 折线上落在行车轨迹里的减速带沿线里程（横向偏移超过阈值的不算）。 */
export function bumpDistancesOnLine(line: LngLat[], cumulative: number[]): number[] {
  const distances: number[] = []
  for (const bump of CAMPUS_SPEED_BUMPS) {
    const projection = projectOntoPolyline(bump, line, cumulative)
    if (projection.offsetMeters <= BUMP_ON_LINE_RADIUS_M) distances.push(projection.distanceAlong)
  }
  return distances.sort((a, b) => a - b)
}

/**
 * 从 fromAlong 开到 toAlong 需要多少秒：把减速带当成局部限速，
 * 沿线每 ETA_SAMPLE_STEP_M 米按该点限速折算，累加即可；
 * 途中真正碾过的减速带再加一次停车让行时间（叮叮车会踩到近 0）。
 */
export function travelSecondsOnLine(
  line: LngLat[],
  cumulative: number[],
  fromAlong: number,
  toAlong: number
): number {
  if (line.length < 2) return 0
  const total = Math.abs(toAlong - fromAlong)
  if (total < 1e-6) return 0
  const low = Math.min(fromAlong, toAlong)
  const high = Math.max(fromAlong, toAlong)
  let seconds = total / CAMPUS_CRUISE_MPS
  for (const bumpAlong of bumpDistancesOnLine(line, cumulative)) {
    if (bumpAlong > low && bumpAlong <= high) seconds += bumpExtraSeconds()
  }
  return seconds
}

/** 只有折线（没有预计算里程表）时的便捷入口。 */
export function travelSecondsAlongPolyline(polyline: LngLat[], fromAlong: number, toAlong: number): number {
  if (polyline.length < 2) return 0
  return travelSecondsOnLine(polyline, cumulativeDistances(polyline), fromAlong, toAlong)
}

/** 计算车辆在线路上的进度。
 * @param bus 车辆 GPS（WGS84）
 * @param stops 线路站点（按行驶顺序）
 * @param polyline 沿路折线（WGS84）；不足 2 点时按站点直连回退
 * @param options.isAtSite 服务端「已到站」标记（优先于 GPS 贴近判定）
 * @param options.speedMps 巡航速度（默认 BUS_SPEED_MPS）
 */
export function computeBusProgress(
  bus: LngLat,
  stops: LngLat[],
  polyline: LngLat[],
  options: { isAtSite?: boolean, speedMps?: number } = {}
): BusProgress | null {
  if (stops.length < 2) return null
  const line = resolveLine(stops, polyline)
  const cumulative = cumulativeDistances(line)
  const stopDistances = stopDistancesOnLine(stops, line, cumulative)

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

  const distanceToNextStopMeters = atStopIndex !== null
    ? 0
    : Math.max(0, stopDistances[nextStopIndex]! - busDistance)
  const cruise = options.speedMps && options.speedMps > 0 ? options.speedMps : null
  const etaSeconds = cruise
    ? distanceToNextStopMeters / cruise
    : travelSecondsOnLine(line, cumulative, busDistance, stopDistances[nextStopIndex]!)

  return {
    segmentIndex,
    progress,
    atStopIndex,
    nextStopIndex,
    distanceToNextStopMeters,
    distanceToDestinationMeters: Math.max(0, destinationDistance - busDistance),
    stopsRemaining: stops.length - 1 - (atStopIndex ?? segmentIndex),
    distanceAlong: busDistance,
    stopDistancesAlong: stopDistances,
    etaSeconds,
    angleDeg: busProjection.angleDeg
  }
}

/**
 * 按沿线里程取折线上的插值点（供平滑动画显示位反算坐标）。
 * 超出范围时钳制到端点。
 */
export function samplePolylinePoint(
  polyline: LngLat[],
  distanceAlong: number
): { point: LngLat, angleDeg: number } {
  if (polyline.length < 2) {
    const only = polyline[0] ?? { lng: 0, lat: 0 }
    return { point: { ...only }, angleDeg: 0 }
  }
  const cumulative = cumulativeDistances(polyline)
  const total = cumulative[cumulative.length - 1]!
  const d = Math.max(0, Math.min(total, distanceAlong))
  for (let i = 1; i < polyline.length; i++) {
    if (cumulative[i]! >= d - 1e-6) {
      const a = polyline[i - 1]!
      const b = polyline[i]!
      const seg = cumulative[i]! - cumulative[i - 1]! || 1
      const t = Math.max(0, Math.min(1, (d - cumulative[i - 1]!) / seg))
      return {
        point: {
          lng: a.lng + (b.lng - a.lng) * t,
          lat: a.lat + (b.lat - a.lat) * t
        },
        angleDeg: segmentBearing(a, b)
      }
    }
  }
  const last = polyline[polyline.length - 1]!
  return { point: { ...last }, angleDeg: segmentBearing(polyline[polyline.length - 2]!, last) }
}

/**
 * 两站间乘车段测算（A→B 查询）：沿线距离、途经站数与预计时长。
 * 起终点顺序无关（同一条线路正反向距离一致）；站点下标越界返回 null。
 */
export function computeStopToStop(
  stops: LngLat[],
  polyline: LngLat[],
  fromIndex: number,
  toIndex: number,
  options: { speedMps?: number } = {}
): { distanceMeters: number, stopsBetween: number, etaSeconds: number } | null {
  if (stops.length < 2) return null
  if (fromIndex < 0 || fromIndex >= stops.length || toIndex < 0 || toIndex >= stops.length) return null
  if (fromIndex === toIndex) return { distanceMeters: 0, stopsBetween: 0, etaSeconds: 0 }
  const line = resolveLine(stops, polyline)
  const cumulative = cumulativeDistances(line)
  const stopDistances = stopDistancesOnLine(stops, line, cumulative)
  const distanceMeters = Math.abs(stopDistances[toIndex]! - stopDistances[fromIndex]!)
  const cruise = options.speedMps && options.speedMps > 0 ? options.speedMps : null
  return {
    distanceMeters,
    stopsBetween: Math.abs(toIndex - fromIndex) - 1,
    etaSeconds: cruise
      ? distanceMeters / cruise
      : travelSecondsOnLine(line, cumulative, stopDistances[fromIndex]!, stopDistances[toIndex]!)
        + (Math.abs(toIndex - fromIndex) - 1) * STATION_DWELL_SECONDS
  }
}
