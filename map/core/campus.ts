import type { GeoPoint } from './types'

export interface GeoBounds {
  west: number
  south: number
  east: number
  north: number
}

export const YEU_OSM_RELATION_ID = 17_685_756
export const YEU_OSM_RELATION_URL = `https://www.openstreetmap.org/relation/${YEU_OSM_RELATION_ID}`

// OSM relation 17685756, reviewed through the public OSM API on 2026-07-13.
export const YEU_CAMPUS_REFERENCE_BOUNDS: GeoBounds = {
  west: 118.5944155,
  south: 25.1036816,
  east: 118.6158472,
  north: 25.1204755
}

// A small buffer catches picking mistakes without pretending the community boundary is a survey.
export const YEU_CAMPUS_COORDINATE_REVIEW_BOUNDS: GeoBounds = {
  west: 118.5924155,
  south: 25.1016816,
  east: 118.6178472,
  north: 25.1224755
}

export const YEU_CAMPUS_REFERENCE_CENTER: GeoPoint = {
  lng: (YEU_CAMPUS_REFERENCE_BOUNDS.west + YEU_CAMPUS_REFERENCE_BOUNDS.east) / 2,
  lat: (YEU_CAMPUS_REFERENCE_BOUNDS.south + YEU_CAMPUS_REFERENCE_BOUNDS.north) / 2,
  crs: 'WGS84'
}

export function isPointWithinBounds(point: Pick<GeoPoint, 'lng' | 'lat'>, bounds: GeoBounds): boolean {
  return point.lng >= bounds.west
    && point.lng <= bounds.east
    && point.lat >= bounds.south
    && point.lat <= bounds.north
}
