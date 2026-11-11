import busRouteGps from '../../../data/seeds/bus-route-gps.json'
import { amapImportedPlaces } from '../../../data/seeds/amap-imported-places'

/**
 * 校车「站间运行时长 / 到站区间」估算。
 *
 * 这是实测采样推出来的区间，不是实时位置；页面必须标注口径与采样日期
 * （2026-11-04 实测采样）。数据里没有班次时刻表，所以这里只回答「从起点
 * 发车后第几分钟到某站」，不做实时到站预测，也不编造末班车时间。
 *
 * 数据链路：
 * 1. `bus-route-gps.json` 提供一次 5 秒间隔的真实轨迹，时间是采样序号 × 5s；
 * 2. 站点只有名字没有坐标，坐标取自 `amap-imported-places.ts` 的同名地点（WGS84）；
 * 3. 把站点坐标投影到轨迹折线上，得到每个站沿轨迹的里程与采样时刻；
 * 4. 相邻站时刻相减即站间行驶秒数，首站归零后累加即累计秒数。
 *
 * 为什么不直接按站点数量均分：均分是编造。投影落在真实轨迹上，站间时长
 * 才来自这次实测的行驶过程；投影偏出轨迹或顺序错乱时宁可返回不可用。
 */

/** 单次实测没有分布可算，把实测累计时长当作中位数基准。 */
export const ETA_BAND_RATIO = 0.2
/**
 * ±20% 的理由：5 秒采样本身有量化误差，校园路口的会车、上下客和一次红灯
 * 大约就是两成浮动；再宽就会把「等下一班」混进「这段路要多久」，页面上的
 * 区间会失去参考意义。数据不足时返回不可用，而不是继续放大区间。
 */
export const ETA_BAND_RATIO_REASON = '5 秒采样量化 + 路口会车/上下客浮动约两成；再宽会混入候车时间。'

/** 采样间隔（秒），与 bus-route-gps.json 的 5s 采样一致。 */
const SAMPLE_INTERVAL_SECONDS = 5
/** 站点锚点离轨迹超过这个距离，视为「stops 与几何不匹配」。 */
const MAX_STOP_OFFSET_METERS = 120
/** 轨迹短于这个长度时没有分段意义。 */
const MIN_ROUTE_METERS = 50
/** 到站判定容差：±30 秒内算「即将到站」。 */
const DUE_WINDOW_SECONDS = 30

export interface BusRoutePoint {
  lng: number
  lat: number
}

export interface BusStopAnchor {
  name: string
  lng: number
  lat: number
}

export interface BusProfileStop {
  stop: string
  /** 从首站起算的累计秒数。 */
  cumulativeSeconds: number
  /** 从首站起算的累计里程（米）。 */
  cumulativeMeters: number
  /** 投影到轨迹上的点（WGS84）。 */
  projected: BusRoutePoint
  /** 站点锚点到轨迹的垂直距离（米）。 */
  offsetMeters: number
}

export interface BusProfileSegment {
  from: string
  to: string
  /** 两站之间的行驶秒数。 */
  seconds: number
  /** 到达 `to` 时从首站起算的累计秒数。 */
  cumulativeSeconds: number
}

export interface BusSegmentProfile {
  available: true
  measuredAt: string
  source: string
  /** 首站到末站的实测总时长（秒）。 */
  totalSeconds: number
  stops: BusProfileStop[]
  segments: BusProfileSegment[]
}

export interface BusEtaUnavailable {
  available: false
  reason: string
  measuredAt: string
}

export type BusSegmentProfileResult = BusSegmentProfile | BusEtaUnavailable

export type BusEtaStatus = 'passed' | 'upcoming' | 'due'

export interface BusEtaStop {
  stop: string
  /** 距离当前时刻还有几分钟到站，[下限, 上限]，已过站时为 [0, 0]。 */
  etaMin: [number, number]
  status: BusEtaStatus
  cumulativeSeconds: number
}

export interface BusEtaEstimate {
  available: true
  minutesSinceDeparture: number
  totalSeconds: number
  stops: BusEtaStop[]
}

export interface BusEtaEstimateUnavailable {
  available: false
  reason: string
  stops: []
}

export type BusEtaEstimateResult = BusEtaEstimate | BusEtaEstimateUnavailable

/**
 * 站点名 → 校园地点名。站点数据只有名字，没有坐标；这些同名地点是仓库里
 * 唯一可用的 WGS84 坐标来源（见 data/seeds/amap-imported-places.ts）。
 */
const STOP_PLACE_NAMES: Record<string, string> = {
  旧区创业园: '创业园',
  旧区行政楼斜对面: '旧区行政楼',
  旧区南门天桥: '南门',
  网络信息中心: '网络信息中心',
  新区图书馆: '图书馆',
  普照楼2号门: '普照教学楼',
  新区和昌楼2号门: '新区和昌教学楼'
}

/** 采样日期是页面口径的一部分；种子用自然语言记录，解析不到时退回常量。 */
const FALLBACK_MEASURED_AT = '2026-11-04'

function measuredAtFromSeed(): string {
  const measured = typeof busRouteGps.measured === 'string' ? busRouteGps.measured : ''
  const match = /(\d{4}-\d{2}-\d{2})/.exec(measured)
  return match?.[1] ?? FALLBACK_MEASURED_AT
}

function unavailable(reason: string): BusEtaUnavailable {
  return { available: false, reason, measuredAt: measuredAtFromSeed() }
}

/** 校园尺度的等距投影：同一纬度带内误差远小于站点投影的容差。 */
function metersBetween(a: BusRoutePoint, b: BusRoutePoint, metersPerLng: number): number {
  return Math.hypot((b.lng - a.lng) * metersPerLng, (b.lat - a.lat) * 110540)
}

function isValidPoint(point: BusRoutePoint | null | undefined): point is BusRoutePoint {
  if (!point || typeof point !== 'object') return false
  const { lng, lat } = point
  return Number.isFinite(lng)
    && Number.isFinite(lat)
    && lng >= -180
    && lng <= 180
    && lat >= -90
    && lat <= 90
    && lng !== 0
    && lat !== 0
}

function resolveStopAnchors(names: string[]): BusStopAnchor[] {
  return names.map((name) => {
    const placeName = STOP_PLACE_NAMES[name]
    const place = placeName ? amapImportedPlaces.find(item => item.name === placeName) : undefined
    return place
      ? { name, lng: place.point.lng, lat: place.point.lat }
      : { name, lng: Number.NaN, lat: Number.NaN }
  })
}

interface TraceProjection {
  /** 沿轨迹的里程（米）。 */
  meters: number
  /** 沿轨迹的采样时刻（秒）。 */
  seconds: number
  /** 投影点。 */
  point: BusRoutePoint
  /** 到轨迹的垂直距离（米）。 */
  offsetMeters: number
}

/**
 * 把站点坐标投影到折线上：逐段求最近点，而不是找最近的采样点。
 * 逐点找会在 5 秒采样间隔（约 25 米）里抖出一整个采样点的误差。
 */
function projectOnTrace(
  anchor: BusStopAnchor,
  points: BusRoutePoint[],
  cumulativeMeters: number[],
  metersPerLng: number
): TraceProjection {
  let best: TraceProjection | null = null
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]!
    const b = points[index]!
    const ax = (a.lng - anchor.lng) * metersPerLng
    const ay = (a.lat - anchor.lat) * 110540
    const bx = (b.lng - anchor.lng) * metersPerLng
    const by = (b.lat - anchor.lat) * 110540
    const dx = bx - ax
    const dy = by - ay
    const lengthSquared = dx * dx + dy * dy
    const ratio = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / lengthSquared))
    const px = ax + dx * ratio
    const py = ay + dy * ratio
    const offsetMeters = Math.hypot(px, py)
    if (best && offsetMeters >= best.offsetMeters) continue
    const segmentMeters = metersBetween(a, b, metersPerLng)
    best = {
      meters: cumulativeMeters[index - 1]! + segmentMeters * ratio,
      seconds: (index - 1 + ratio) * SAMPLE_INTERVAL_SECONDS,
      point: {
        lng: a.lng + (b.lng - a.lng) * ratio,
        lat: a.lat + (b.lat - a.lat) * ratio
      },
      offsetMeters
    }
  }
  if (!best) throw new Error('trace has no segments')
  return best
}

/**
 * 从实测轨迹生成站间运行时长。
 *
 * @param input.points 轨迹点，默认取 `data/seeds/bus-route-gps.json`。
 * @param input.stops 站点锚点，默认按 `STOP_PLACE_NAMES` 从校园地点表解析。
 * @returns 脏数据、站点对不上几何或坐标越界时返回 `{ available: false, reason }`，不抛异常。
 */
export function buildBusSegmentProfile(input: {
  points?: BusRoutePoint[]
  stops?: BusStopAnchor[]
} = {}): BusSegmentProfileResult {
  try {
    const rawPoints = input.points ?? (busRouteGps.points as BusRoutePoint[])
    if (!Array.isArray(rawPoints) || rawPoints.length < 2) {
      return unavailable('采样点不足：至少需要 2 个轨迹点')
    }
    for (const [index, point] of rawPoints.entries()) {
      if (!isValidPoint(point)) {
        return unavailable(`采样点坐标越界或为空（第 ${index + 1} 个点）`)
      }
    }
    const points = rawPoints

    const stopNames = Array.isArray(busRouteGps.stops) ? busRouteGps.stops : []
    const anchors = input.stops ?? resolveStopAnchors(stopNames)
    if (!Array.isArray(anchors) || anchors.length < 2) {
      return unavailable('站点不足：至少需要 2 个站')
    }
    for (const anchor of anchors) {
      if (!anchor || typeof anchor.name !== 'string' || anchor.name.trim() === '') {
        return unavailable('站点名缺失')
      }
      if (!isValidPoint({ lng: anchor.lng, lat: anchor.lat })) {
        return unavailable(`站点「${anchor.name}」缺少有效坐标`)
      }
    }

    const meanLat = points.reduce((sum, point) => sum + point.lat, 0) / points.length
    const metersPerLng = 111320 * Math.cos((meanLat * Math.PI) / 180)
    const cumulativeMeters: number[] = [0]
    for (let index = 1; index < points.length; index += 1) {
      cumulativeMeters.push(
        cumulativeMeters[index - 1]! + metersBetween(points[index - 1]!, points[index]!, metersPerLng)
      )
    }
    const totalMeters = cumulativeMeters[cumulativeMeters.length - 1]!
    if (totalMeters < MIN_ROUTE_METERS) {
      return unavailable('采样轨迹过短，无法划出站间区间')
    }

    const projections = anchors.map(anchor => projectOnTrace(anchor, points, cumulativeMeters, metersPerLng))
    for (const [index, projection] of projections.entries()) {
      if (projection.offsetMeters > MAX_STOP_OFFSET_METERS) {
        return unavailable(
          `站点「${anchors[index]!.name}」偏离实测轨迹 ${Math.round(projection.offsetMeters)} 米，站点与几何不匹配`
        )
      }
    }

    const firstSeconds = projections[0]!.seconds
    // 首站落在轨迹起点附近时允许几秒的采样偏移；首站归零，后续站点按同一基线平移。
    const stops: BusProfileStop[] = []
    for (const [index, projection] of projections.entries()) {
      const cumulativeSeconds = Math.round(projection.seconds - firstSeconds)
      if (index > 0 && cumulativeSeconds <= stops[index - 1]!.cumulativeSeconds) {
        return unavailable(`站点「${anchors[index]!.name}」顺序与实测轨迹不匹配`)
      }
      stops.push({
        stop: anchors[index]!.name,
        cumulativeSeconds,
        cumulativeMeters: Math.round(projection.meters),
        projected: projection.point,
        offsetMeters: Math.round(projection.offsetMeters)
      })
    }

    const segments: BusProfileSegment[] = stops.slice(1).map((stop, index) => ({
      from: stops[index]!.stop,
      to: stop.stop,
      seconds: stop.cumulativeSeconds - stops[index]!.cumulativeSeconds,
      cumulativeSeconds: stop.cumulativeSeconds
    }))
    if (segments.some(segment => segment.seconds <= 0)) {
      return unavailable('站间时长为零：站点顺序与实测轨迹不匹配')
    }

    return {
      available: true,
      measuredAt: measuredAtFromSeed(),
      source: typeof busRouteGps.source === 'string' ? busRouteGps.source : 'bus-route-gps.json',
      totalSeconds: stops[stops.length - 1]!.cumulativeSeconds,
      stops,
      segments
    }
  } catch {
    // 脏数据不能把页面打挂；解析失败一律降级为中性空态。
    return unavailable('实测数据无法解析')
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * 按「已经发车多少分钟」推算各站到站区间。
 *
 * 这是实测采样推出来的区间，不是实时位置：没有班次时刻表和车辆位置，
 * 所以只能回答「从首站发车后第 N 分钟，各站大概还有多久到」。页面必须
 * 标注口径与采样日期（2026-11-04 实测采样，非实时），不能把它读成实时
 * 到站预测。`etaMin` 表示「从现在起还有几分钟到站」，已过站为 `[0, 0]`；
 * 区间取实测累计时长的 ±`ETA_BAND_RATIO`。
 *
 * @param input.minutesSinceDeparture 已从首站发车的分钟数，负数视为脏数据。
 * @param input.profile 可注入已构建的区间，省略时读默认种子。
 * @returns 数据不可用或分钟数为负时返回 `{ available: false, reason }`，不抛异常。
 */
export function estimateBusEta(input: {
  minutesSinceDeparture: number
  profile?: BusSegmentProfileResult
}): BusEtaEstimateResult {
  const profile = input.profile ?? buildBusSegmentProfile()
  if (!profile.available) {
    return { available: false, reason: profile.reason, stops: [] }
  }
  const minutes = input.minutesSinceDeparture
  if (!Number.isFinite(minutes) || minutes < 0) {
    return { available: false, reason: '发车分钟数必须是 0 或正数', stops: [] }
  }

  const elapsedSeconds = minutes * 60
  const stops: BusEtaStop[] = profile.stops.map((stop) => {
    const deltaSeconds = stop.cumulativeSeconds - elapsedSeconds
    const status: BusEtaStatus = deltaSeconds < -DUE_WINDOW_SECONDS
      ? 'passed'
      : deltaSeconds <= DUE_WINDOW_SECONDS ? 'due' : 'upcoming'
    if (status === 'passed') {
      return { stop: stop.stop, etaMin: [0, 0], status, cumulativeSeconds: stop.cumulativeSeconds }
    }
    const measuredMinutes = stop.cumulativeSeconds / 60
    const low = Math.max(0, measuredMinutes * (1 - ETA_BAND_RATIO) - minutes)
    const high = Math.max(0, measuredMinutes * (1 + ETA_BAND_RATIO) - minutes)
    return {
      stop: stop.stop,
      etaMin: [round1(low), round1(Math.max(low, high))],
      status,
      cumulativeSeconds: stop.cumulativeSeconds
    }
  })

  return {
    available: true,
    minutesSinceDeparture: minutes,
    totalSeconds: profile.totalSeconds,
    stops
  }
}

/** 采样口径（页面必须原样展示，避免把区间读成实时到站）。 */
export const BUS_ETA_SAMPLE_CAVEAT = '数据口径：2026-11-04 实测采样，非实时'
