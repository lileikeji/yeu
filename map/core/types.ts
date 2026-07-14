import type { CoordinateReferenceSystem } from '../../shared/types'

export interface GeoPoint {
  lng: number
  lat: number
  crs: CoordinateReferenceSystem
}

export interface MapPoi {
  id: string
  name: string
  category: string
  point: GeoPoint
  status: 'draft' | 'published' | 'archived'
}

export interface MapArea {
  id: string
  name: string
  /** Reviewed WGS84 rectangle derived from a WIA sparseList bounding box. */
  bounds: {
    southWest: GeoPoint
    northEast: GeoPoint
  }
  strokeColor: string
  fillColor: string
  areaSquareMeters: number | null
  perimeterMeters: number | null
  geometrySource: 'wia-bounding-box'
}

export interface MapMountOptions {
  center?: GeoPoint
  zoom?: number
}
