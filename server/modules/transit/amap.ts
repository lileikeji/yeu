import type { ApiTransitPlan, ApiTransitPlanResponse, ApiTransitSegment } from '../../../shared/types/server'

export const transitPoints = {
  'campus': { id: 'campus', label: '仰恩大学第三校区', location: '118.602248,25.107339' },
  'quanzhou-station': { id: 'quanzhou-station', label: '泉州站', location: '118.567400,24.972310' },
  'quanzhou-east': { id: 'quanzhou-east', label: '泉州东站', location: '118.769523,24.921998' },
  'jinjiang-airport': { id: 'jinjiang-airport', label: '泉州晋江国际机场', location: '118.593047,24.794712' },
  'city-center': { id: 'city-center', label: '泉州市工人文化宫', location: '118.593378,24.905176' }
} as const

export type TransitPointId = keyof typeof transitPoints

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
  const normalized = typeof value === 'number' ? value : textValue(value)
  if (normalized === '') return null
  const number = typeof normalized === 'number' ? normalized : Number(normalized)
  return Number.isFinite(number) ? number : null
}

function formatServiceTime(value: unknown): string | null {
  const compact = textValue(value)
  if (!/^\d{4}$/.test(compact)) return null
  return `${compact.slice(0, 2)}:${compact.slice(2)}`
}

function parseBusSegment(value: unknown): ApiTransitSegment[] {
  const segment = record(value)
  const bus = record(segment.bus)
  return list(bus.buslines).map((lineValue) => {
    const line = record(lineValue)
    return {
      name: textValue(line.name),
      departureStop: textValue(record(line.departure_stop).name),
      arrivalStop: textValue(record(line.arrival_stop).name),
      startTime: formatServiceTime(line.start_time),
      endTime: formatServiceTime(line.end_time),
      viaStops: numberValue(line.via_num)
    }
  }).filter(segment => segment.name && segment.departureStop && segment.arrivalStop)
}

function parseTransitPlan(value: unknown): ApiTransitPlan | null {
  const transit = record(value)
  const durationSeconds = numberValue(transit.duration)
  if (durationSeconds === null) return null
  const fare = numberValue(transit.cost)
  return {
    durationMinutes: Math.max(1, Math.round(durationSeconds / 60)),
    fareYuan: fare,
    walkingMeters: Math.max(0, Math.round(numberValue(transit.walking_distance) ?? 0)),
    segments: list(transit.segments).flatMap(parseBusSegment)
  }
}

export function parseAmapTransitResponse(
  payload: unknown,
  originId: TransitPointId,
  destinationId: TransitPointId,
  queriedAt = new Date().toISOString()
): ApiTransitPlanResponse {
  const root = record(payload)
  if (textValue(root.status) !== '1') {
    throw new Error(textValue(root.info) || 'Amap transit service returned an error')
  }
  const plans = list(record(root.route).transits)
    .map(parseTransitPlan)
    .filter((plan): plan is ApiTransitPlan => Boolean(plan && plan.segments.length))
    .slice(0, 3)
  if (plans.length === 0) throw new Error('Amap returned no usable transit plan')

  const origin = transitPoints[originId]
  const destination = transitPoints[destinationId]
  return {
    provider: 'amap',
    queriedAt,
    origin: { id: origin.id, label: origin.label },
    destination: { id: destination.id, label: destination.label },
    plans,
    vehiclePositionsAvailable: false
  }
}

export function isTransitPointId(value: unknown): value is TransitPointId {
  return typeof value === 'string' && value in transitPoints
}
