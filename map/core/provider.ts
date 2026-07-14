import type { GeoPoint, MapArea, MapMountOptions, MapPoi } from './types'

export type PointPickedHandler = (point: GeoPoint) => void
export type PoiSelectHandler = (poi: MapPoi | null) => void
export type MapErrorHandler = (error: Error) => void
export type MapProviderId = 'maplibre-dev' | 'amap'

export interface RouteSummary {
  distanceMeters: number
  durationSeconds: number
}

export interface MapProvider {
  readonly id: MapProviderId
  mount(element: HTMLElement, options?: MapMountOptions): Promise<void>
  setPois(pois: MapPoi[]): void
  setAreas(areas: MapArea[]): void
  fitToPois(): void
  enablePointPicker(handler: PointPickedHandler): void
  disablePointPicker(): void
  setSelectedPoi(id: string | null): void
  flyToPoi(id: string): boolean
  flyToPoint(point: GeoPoint, zoom?: number): boolean
  planWalkingRoute(origin: GeoPoint, destination: GeoPoint): Promise<RouteSummary>
  clearRoute(): void
  onPoiSelect(handler: PoiSelectHandler): () => void
  onError(handler: MapErrorHandler): () => void
  destroy(): void
}
