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

export interface MapMountOptions {
  center?: GeoPoint
  zoom?: number
}
