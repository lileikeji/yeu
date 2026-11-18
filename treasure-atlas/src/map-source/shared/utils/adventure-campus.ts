import campusBoundary from '../../data/seeds/osm-campus-boundary.json' with { type: 'json' }
import type { GeoPoint } from '../../map/core/types.ts'

export const adventureBoundary = campusBoundary
const polygons = adventureBoundary.geometry.coordinates

export type CampusRegion = 'new' | 'old'
export const campusRegionNames: Record<CampusRegion, string> = { new: '新区', old: '旧区' }

export function isInsideAdventureCampus(point: Pick<GeoPoint, 'lng' | 'lat'>): boolean {
  return polygons.some(polygon => insideRing(polygon[0]!) && !polygon.slice(1).some(insideRing))

  function insideRing(ring: number[][]): boolean {
    let inside = false
    for (let i = 1; i < ring.length; i++) {
      const [aLng, aLat] = ring[i - 1]! as [number, number]
      const [bLng, bLat] = ring[i]! as [number, number]
      if ((aLat > point.lat) !== (bLat > point.lat)
        && point.lng < aLng + (bLng - aLng) * (point.lat - aLat) / (bLat - aLat)) inside = !inside
    }
    return inside
  }
}

// The catalog includes 泽钏教学楼 in the new campus and 共和教学楼 in the old campus.
export function adventureRegion(point: GeoPoint): CampusRegion {
  return point.lng < 118.608 ? 'new' : 'old'
}
