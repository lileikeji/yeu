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

const DRIVING_ENDPOINT = 'https://restapi.amap.com/v3/direction/driving'
/** 高德途经点上限 16，两端各占一个，所以每段最多 18 个输入点。 */
const MAX_POINTS_PER_SEGMENT = 18
const TIMEOUT_MS = 12_000
/** 算路比实测链长超过这个比例就认为绕远，放弃细化。 */
const MAX_LENGTH_RATIO = 1.2

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

/** 一段行驶（起点 + 途经点 + 终点）→ 折线；失败返回 null。 */
async function fetchDrivingSegment(amapKey: string, points: ShapePoint[]): Promise<ShapePoint[] | null> {
  if (points.length < 2) return null
  const origin = toGcj(points[0]!)
  const destination = toGcj(points[points.length - 1]!)
  const url = new URL(DRIVING_ENDPOINT)
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
  const refined: ShapePoint[] = []
  for (let start = 0; start < shape.length - 1; start += MAX_POINTS_PER_SEGMENT - 1) {
    const chunk = shape.slice(start, Math.min(shape.length, start + MAX_POINTS_PER_SEGMENT))
    if (chunk.length < 2) break
    const segment = await fetchDrivingSegment(amapKey, chunk)
    if (!segment) return null
    for (const point of segment) {
      const last = refined[refined.length - 1]
      if (last && Math.abs(last.lng - point.lng) < 1e-9 && Math.abs(last.lat - point.lat) < 1e-9) continue
      refined.push(point)
    }
  }
  if (refined.length < shape.length) return null
  if (shapeLength(refined) > baseLength * MAX_LENGTH_RATIO) return null
  return refined
}
