/**
 * 校车线路「贴路」细化：把 46 点的实测轨迹链按 16 个途经点一段丢给高德算路，
 * 让折线沿着真实车行道拐弯，而不是在采样点之间拉直线切角。
 *
 * 只在实测链存在时使用；算路失败或绕远（长度超出链长 20%）就保留原链。
 * 输入输出都是 WGS84，请求/响应在内部转 GCJ-02。
 */

import { gcj02ToWgs84, wgs84ToGcj02 } from '../../../shared/utils/coordinate-convert'

export interface ShapePoint {
  lng: number
  lat: number
}

// 校园里是巷道，驾车算路会拐到南门外的大路上去；步行算路才贴着实际走的那条路。
const WALKING_ENDPOINT = 'https://restapi.amap.com/v3/direction/walking'
const DRIVING_ENDPOINT = 'https://restapi.amap.com/v3/direction/driving'
/** 高德途经点上限 16，两端各占一个，所以每段最多 18 个输入点；这里收紧到 10，约束更强。 */
const MAX_POINTS_PER_SEGMENT = 10
const TIMEOUT_MS = 12_000
/** 算路比实测链长超过这个比例就认为绕远，放弃细化。 */
const MAX_LENGTH_RATIO = 1.2
/** 抽稀容差：小于这个距离的抖动点不当作途经点。 */
const SIMPLIFY_TOLERANCE_M = 18
/** 细化点允许偏离实测链的最大距离；超出说明算路绕路了。 */
const MAX_CORRIDOR_M = 35

function toGcj(point: ShapePoint): ShapePoint {
  const gcj = wgs84ToGcj02(point.lng, point.lat)
  return { lng: gcj.longitude, lat: gcj.latitude }
}

function haversine(a: ShapePoint, b: ShapePoint): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 6_371_000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function shapeLength(points: ShapePoint[]): number {
  let total = 0
  for (let i = 1; i < points.length; i += 1) total += haversine(points[i - 1]!, points[i]!)
  return total
}

/**
 * Douglas–Peucker 抽稀：GPS 在站点停靠时会来回抖 10–25 m，这些抖动点当成途经点
 * 丢给高德，算路会为了「经过它」绕一个钩子（南门那段就是这么绕出来的）。
 * 先用 15 m 容差把抖动点去掉，再分段算路。
 */
/**
 * 去掉尖刺点：GPS 停站/掉头时会出现「出去 20–40 m 又回来」的点，
 * 直接算路会被理解成「必须绕到那里」，于是画出一个钩子。
 * 判定：p[i] 到前后两点连线的距离很小（< 8 m），但 p[i] 离两点都超过 20 m。
 */
function dropSpikes(points: ShapePoint[]): ShapePoint[] {
  const out: ShapePoint[] = [points[0]!]
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = out[out.length - 1]!
    const current = points[i]!
    const next = points[i + 1]!
    const incoming = haversine(prev, current)
    const outgoing = haversine(current, next)
    const direct = haversine(prev, next)
    if (incoming > 20 && outgoing > 20 && direct < 8) continue
    out.push(current)
  }
  out.push(points[points.length - 1]!)
  return out
}

function simplify(points: ShapePoint[], tolerance: number): ShapePoint[] {
  if (points.length <= 2) return points.slice()
  const first = points[0]!
  const last = points[points.length - 1]!
  let maxDistance = 0
  let index = 0
  for (let i = 1; i < points.length - 1; i += 1) {
    const point = points[i]!
    const cosLat = Math.cos(point.lat * Math.PI / 180)
    const ax = (last.lng - first.lng) * cosLat
    const ay = last.lat - first.lat
    const px = (point.lng - first.lng) * cosLat
    const py = point.lat - first.lat
    const lengthSquared = ax * ax + ay * ay
    const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, (px * ax + py * ay) / lengthSquared))
    const dx = px - ax * t
    const dy = py - ay * t
    const distance = Math.sqrt(dx * dx + dy * dy) * 111_320
    if (distance > maxDistance) {
      maxDistance = distance
      index = i
    }
  }
  if (maxDistance <= tolerance) return [first, last]
  const head = simplify(points.slice(0, index + 1), tolerance)
  const tail = simplify(points.slice(index), tolerance)
  return [...head.slice(0, -1), ...tail]
}

/** 点到折线的最短距离（米，平面近似）。 */
function distanceToPolyline(point: ShapePoint, line: ShapePoint[]): number {
  let best = Infinity
  for (let i = 0; i < line.length - 1; i += 1) {
    const a = line[i]!
    const b = line[i + 1]!
    const cosLat = Math.cos(point.lat * Math.PI / 180)
    const ax = (b.lng - a.lng) * cosLat
    const ay = b.lat - a.lat
    const px = (point.lng - a.lng) * cosLat
    const py = point.lat - a.lat
    const lengthSquared = ax * ax + ay * ay
    const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, (px * ax + py * ay) / lengthSquared))
    const dx = px - ax * t
    const dy = py - ay * t
    best = Math.min(best, Math.sqrt(dx * dx + dy * dy) * 111_320)
  }
  return best
}

/**
 * 走廊约束：算路必须贴着实测链走。超出 MAX_CORRIDOR_M 的点直接丢掉，
 * 这样「为了经过某个点绕一圈」的钩子会被削掉，剩下的仍是沿路的折线。
 */
function clampToCorridor(refined: ShapePoint[], corridor: ShapePoint[]): ShapePoint[] {
  return refined.filter(point => distanceToPolyline(point, corridor) <= MAX_CORRIDOR_M)
}

function parsePolyline(raw: unknown): ShapePoint[] {
  if (typeof raw !== 'string' || !raw) return []
  const out: ShapePoint[] = []
  for (const pair of raw.split(';')) {
    const [lngText, latText] = pair.split(',')
    const lng = Number(lngText)
    const lat = Number(latText)
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    const wgs = gcj02ToWgs84(lng, lat)
    out.push({ lng: wgs.longitude, lat: wgs.latitude })
  }
  return out
}

/** 一段折线（起点 + 途经点 + 终点）→ 贴路折线；失败返回 null。 */
async function fetchRouteSegment(amapKey: string, points: ShapePoint[], endpoint: string): Promise<ShapePoint[] | null> {
  if (points.length < 2) return null
  const origin = toGcj(points[0]!)
  const destination = toGcj(points[points.length - 1]!)
  const url = new URL(endpoint)
  const params = new URLSearchParams({
    key: amapKey,
    origin: `${origin.lng},${origin.lat}`,
    destination: `${destination.lng},${destination.lat}`,
    extensions: 'all'
  })
  if (points.length > 2) {
    params.set('waypoints', points.slice(1, -1).map((point) => {
      const gcj = toGcj(point)
      return `${gcj.lng},${gcj.lat}`
    }).join(';'))
  }
  url.search = params.toString()
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!response.ok) return null
    const payload = await response.json() as { status?: string, route?: { paths?: Array<{ steps?: Array<{ polyline?: string }> }> } }
    if (payload.status !== '1') return null
    const steps = payload.route?.paths?.[0]?.steps ?? []
    const out: ShapePoint[] = []
    for (const step of steps) out.push(...parsePolyline(step.polyline))
    return out.length >= 2 ? out : null
  } catch {
    return null
  }
}

/**
 * 把实测轨迹链细化成贴路折线。任何一段失败就整体放弃（返回 null），
 * 由调用方保留原链，不引入半截样的缺口。
 */
export async function refineShapeWithRoads(amapKey: string, shape: ShapePoint[]): Promise<ShapePoint[] | null> {
  if (!amapKey || shape.length < 3) return null
  const baseLength = shapeLength(shape)
  if (baseLength <= 0) return null
  // 先把停站抖动（10–25 m 来回）抽掉，否则会为了经过抖动点绕钩子。
  const shapePoints = simplify(dropSpikes(shape), SIMPLIFY_TOLERANCE_M)
  const refined: ShapePoint[] = []
  for (let start = 0; start < shapePoints.length - 1; start += MAX_POINTS_PER_SEGMENT - 1) {
    const chunk = shapePoints.slice(start, Math.min(shapePoints.length, start + MAX_POINTS_PER_SEGMENT))
    if (chunk.length < 2) break
    // 步行优先（贴小路），失败退驾车，再失败就用这段的直线，不让整条线路退化。
    const segment = await fetchRouteSegment(amapKey, chunk, WALKING_ENDPOINT)
      ?? await fetchRouteSegment(amapKey, chunk, DRIVING_ENDPOINT)
      ?? [chunk[0]!, chunk[chunk.length - 1]!]
    for (const point of segment) {
      const last = refined[refined.length - 1]
      if (last && Math.abs(last.lng - point.lng) < 1e-9 && Math.abs(last.lat - point.lat) < 1e-9) continue
      refined.push(point)
    }
  }
  const clamped = clampToCorridor(refined, shape)
  if (clamped.length < shapePoints.length) return null
  if (shapeLength(clamped) > baseLength * MAX_LENGTH_RATIO) return null
  return clamped
}

/**
 * 按站点逐段算路拼整条线路：每两个相邻站点各要一条步行路线（校园里车走的就是这些巷道），
 * 拼起来天然贴路，也不会凭空绕到别的地方。任何一段失败就退驾车、再退直连，
 * 并用 complete 标记让调用方决定要不要短期重算。
 */
export async function buildShapeThroughStops(
  amapKey: string,
  stops: Array<{ lng: number, lat: number }>,
  options: { gapMs?: number, origin?: { lng: number, lat: number } } = {}
): Promise<{ polyline: ShapePoint[], complete: boolean } | null> {
  if (!amapKey || stops.length < 2) return null
  const points: ShapePoint[] = stops.map(stop => ({ lng: stop.lng, lat: stop.lat }))
  if (options.origin) points[0] = { ...options.origin }
  const gapMs = options.gapMs ?? 220
  let complete = true
  const out: ShapePoint[] = []
  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i]!
    const to = points[i + 1]!
    if (i > 0 && gapMs > 0) await new Promise(resolve => setTimeout(resolve, gapMs))
    // 先按车行道算，拿不到再退步行（步行会穿楼间小路，看起来不贴马路）。
    const segment = await fetchRouteSegment(amapKey, [from, to], DRIVING_ENDPOINT)
      ?? await fetchRouteSegment(amapKey, [from, to], WALKING_ENDPOINT)
    const leg = segment && segment.length >= 2 ? segment : [from, to]
    if (!segment) complete = false
    for (const point of leg) {
      const last = out[out.length - 1]
      if (last && Math.abs(last.lng - point.lng) < 1e-9 && Math.abs(last.lat - point.lat) < 1e-9) continue
      out.push(point)
    }
  }
  return out.length >= 2 ? { polyline: out, complete } : null
}
