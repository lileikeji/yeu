import type { ApiWalkingRoute, ApiWalkingStep } from '../../../shared/types/server'

const WALKING_ENDPOINT = 'https://restapi.amap.com/v3/direction/walking'

/** AMap 未返回 duration 时的兜底步速（约 4.3km/h）。 */
const FALLBACK_METERS_PER_SECOND = 1.2
const MAX_STEPS = 40
const MAX_POLYLINE_POINTS = 600

export interface WalkingRouteEndpoint {
  label: string
  slug?: string
  longitude: number
  latitude: number
}

export interface AmapWalkingRequestOptions {
  timeoutMs?: number
  fetcher?: typeof fetch
  queriedAt?: string
}

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {}
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const normalized = textValue(value)
  if (normalized === '') return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

/** 高德折线是 "lng,lat;lng,lat" 的字符串，这里解析成点位数组。 */
export function parseAmapPolyline(value: unknown): Array<{ longitude: number, latitude: number }> {
  const raw = textValue(value)
  if (!raw) return []
  const points: Array<{ longitude: number, latitude: number }> = []
  for (const pair of raw.split(';')) {
    const [longitudeText, latitudeText] = pair.split(',')
    const longitude = numberValue(longitudeText)
    const latitude = numberValue(latitudeText)
    if (longitude === null || latitude === null) continue
    if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) continue
    const previous = points[points.length - 1]
    if (previous && previous.longitude === longitude && previous.latitude === latitude) continue
    points.push({ longitude, latitude })
    if (points.length >= MAX_POLYLINE_POINTS) break
  }
  return points
}

function parseStep(value: unknown): ApiWalkingStep | null {
  const step = record(value)
  const instruction = textValue(step.instruction)
  const distanceMeters = numberValue(step.distance)
  if (!instruction || distanceMeters === null || distanceMeters < 0) return null
  const durationSeconds = numberValue(step.duration)
  return {
    instruction,
    distanceMeters: Math.round(distanceMeters),
    durationSeconds: durationSeconds === null ? null : Math.max(0, Math.round(durationSeconds))
  }
}

export function parseAmapWalkingResponse(
  payload: unknown,
  origin: WalkingRouteEndpoint,
  destination: WalkingRouteEndpoint,
  queriedAt = new Date().toISOString()
): ApiWalkingRoute {
  const root = record(payload)
  if (textValue(root.status) !== '1') {
    throw new Error(textValue(root.info) || 'Amap walking service returned an error')
  }

  const route = record(root.route)
  const path = record(list(route.paths)[0])
  const distanceMeters = numberValue(path.distance)
  if (distanceMeters === null || distanceMeters <= 0) {
    throw new Error('Amap walking service returned no usable route')
  }

  const rawSteps = list(path.steps)
    .map(parseStep)
    .filter((step): step is ApiWalkingStep => step !== null)
    .slice(0, MAX_STEPS)

  // 每个 step 带自己的一段折线，按顺序拼接才是完整路线。
  const polyline = rawSteps.length
    ? dedupePoints(rawSteps.flatMap((_, index) => parseAmapPolyline(record(list(path.steps)[index]).polyline)))
    : parseAmapPolyline(path.polyline)

  const reportedDuration = numberValue(path.duration)
  const durationSeconds = reportedDuration !== null && reportedDuration > 0
    ? Math.round(reportedDuration)
    : Math.max(60, Math.round(distanceMeters / FALLBACK_METERS_PER_SECOND))

  return {
    provider: 'amap',
    queriedAt,
    coordinateSystem: 'GCJ-02',
    origin: { label: origin.label, longitude: origin.longitude, latitude: origin.latitude },
    destination: {
      label: destination.label,
      slug: destination.slug ?? '',
      longitude: destination.longitude,
      latitude: destination.latitude
    },
    distanceMeters: Math.round(distanceMeters),
    durationSeconds,
    polyline,
    steps: rawSteps
  }
}

function dedupePoints(points: Array<{ longitude: number, latitude: number }>): Array<{ longitude: number, latitude: number }> {
  const result: Array<{ longitude: number, latitude: number }> = []
  for (const point of points) {
    const previous = result[result.length - 1]
    if (previous && previous.longitude === point.longitude && previous.latitude === point.latitude) continue
    result.push(point)
  }
  return result.slice(0, MAX_POLYLINE_POINTS)
}

export async function fetchAmapWalkingRoute(
  key: string,
  origin: WalkingRouteEndpoint,
  destination: WalkingRouteEndpoint,
  options: AmapWalkingRequestOptions = {}
): Promise<ApiWalkingRoute> {
  const normalizedKey = key.trim()
  if (!normalizedKey) throw new Error('Amap walking service is not configured')

  const url = new URL(WALKING_ENDPOINT)
  url.search = new URLSearchParams({
    key: normalizedKey,
    origin: `${origin.longitude},${origin.latitude}`,
    destination: `${destination.longitude},${destination.latitude}`,
    output: 'JSON'
  }).toString()

  const response = await (options.fetcher ?? fetch)(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(Math.max(1_000, options.timeoutMs ?? 8_000))
  })
  if (!response.ok) throw new Error(`Amap walking service returned HTTP ${response.status}`)
  return parseAmapWalkingResponse(await response.json(), origin, destination, options.queriedAt)
}
