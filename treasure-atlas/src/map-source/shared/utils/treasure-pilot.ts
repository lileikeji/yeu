import type { GeoPoint, MapPoi } from '../../map/core/types.ts'
import { amapImportedPlaces } from '../../data/seeds/amap-imported-places.ts'
import { gcj02ToWgs84 } from './coordinate-convert.ts'
import { haversineMeters } from './bus-route-progress.ts'

export const treasureRadius = 20
export const treasureMaxAccuracy = 12
export const treasureMaxAge = 15_000
const earthRadius = 6_371_000

const reference = amapImportedPlaces.find(place => place.sourceRow === 66)!
export const treasureReference = reference.point
const wgs = reference.point.crs === 'GCJ-02'
  ? gcj02ToWgs84(reference.point.lng, reference.point.lat)
  : { longitude: reference.point.lng, latitude: reference.point.lat }

export const treasurePoint: GeoPoint = { lng: wgs.longitude, lat: wgs.latitude, crs: 'WGS84' }
export const treasurePoi: MapPoi = {
  id: 'treasure-pilot-yangen',
  name: '仰恩楼试跑宝箱',
  category: 'treasure-pilot',
  point: treasurePoint,
  status: 'draft'
}

export interface TreasurePosition {
  lng: number
  lat: number
  accuracy: number
  timestamp: number
}

export interface TreasureProgress {
  opened: boolean
  totalOpened: number
}

export function pointAtDistance(center: GeoPoint, meters: number, bearing: number): GeoPoint {
  const radians = Math.PI / 180
  const arc = meters / earthRadius
  const angle = bearing * radians
  const lat = center.lat * radians
  const nextLat = Math.asin(Math.sin(lat) * Math.cos(arc) + Math.cos(lat) * Math.sin(arc) * Math.cos(angle))
  const nextLng = Math.atan2(Math.sin(angle) * Math.sin(arc) * Math.cos(lat), Math.cos(arc) - Math.sin(lat) * Math.sin(nextLat))
  return { lng: center.lng + nextLng / radians, lat: nextLat / radians, crs: center.crs }
}

export function evaluateTreasurePosition(position: TreasurePosition, now = Date.now(), center = treasurePoint) {
  const { lng, lat, accuracy, timestamp } = position
  if (![lng, lat, accuracy, timestamp].every(Number.isFinite) || Math.abs(lng) > 180 || Math.abs(lat) > 90 || accuracy < 0) {
    return { result: 'invalid' as const, distance: null }
  }
  const distance = haversineMeters(center, position)
  if (timestamp > now + 2000 || now - timestamp > treasureMaxAge) return { result: 'stale' as const, distance }
  if (accuracy > treasureMaxAccuracy) return { result: 'imprecise' as const, distance }
  // Allow only sub-millimetre floating point noise when constructing the exact boundary.
  return { result: distance <= treasureRadius + 1e-6 ? 'inside' as const : 'outside' as const, distance }
}
