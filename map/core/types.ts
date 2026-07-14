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

interface MapAreaBase {
  id: string
  name: string
  description?: string
  strokeColor: string
  fillColor: string
  areaSquareMeters: number | null
  perimeterMeters: number | null
}

export interface MapBoundingArea extends MapAreaBase {
  /** Reviewed WGS84 rectangle derived from a WIA sparseList bounding box. */
  bounds: {
    southWest: GeoPoint
    northEast: GeoPoint
  }
  geometrySource: 'wia-bounding-box'
}

export interface MapPolygonArea extends MapAreaBase {
  /** Exact rings decoded from the WIA shape response, with explicit per-point CRS. */
  paths: GeoPoint[][]
  geometrySource: 'wia-shape-batch'
}

export type MapArea = MapBoundingArea | MapPolygonArea

export interface MapMountOptions {
  center?: GeoPoint
  zoom?: number
}
