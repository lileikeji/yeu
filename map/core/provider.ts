import type { GeoPoint, MapArea, MapMountOptions, MapPoi } from './types'

export type PointPickedHandler = (point: GeoPoint) => void
export type PoiSelectHandler = (poi: MapPoi | null) => void
export type AreaSelectHandler = (area: MapArea | null) => void
export type MapErrorHandler = (error: Error) => void
export type MapProviderId = 'maplibre-dev' | 'amap'
export type MapBaseStyle = 'standard' | 'satellite'
export type MapLabelSize = 'extra-small' | 'small' | 'medium' | 'large'

export interface MapDisplayOptions {
  showPois: boolean
  showAreas: boolean
  showLabels: boolean
  autoCluster: boolean
  labelSize: MapLabelSize
}

export interface RouteSummary {
  distanceMeters: number
  durationSeconds: number
}

export interface MapProvider {
  readonly id: MapProviderId
  mount(element: HTMLElement, options?: MapMountOptions): Promise<void>
  setPois(pois: MapPoi[]): void
  setAreas(areas: MapArea[]): void
  setDisplayOptions(options: MapDisplayOptions): void
  setBaseStyle(style: MapBaseStyle): boolean
  fitToPois(): void
  enablePointPicker(handler: PointPickedHandler): void
  disablePointPicker(): void
  setSelectedPoi(id: string | null): void
  flyToPoi(id: string): boolean
  flyToPoint(point: GeoPoint, zoom?: number): boolean
  planWalkingRoute(origin: GeoPoint, destination: GeoPoint): Promise<RouteSummary>
  clearRoute(): void
  onPoiSelect(handler: PoiSelectHandler): () => void
  onAreaSelect(handler: AreaSelectHandler): () => void
  onError(handler: MapErrorHandler): () => void
  destroy(): void
}
