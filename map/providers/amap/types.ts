export type AMapPosition = [number, number]

export interface AMapLngLat {
  getLng(): number
  getLat(): number
}
export interface AMapMouseEvent {
  originEvent?: Event
}

export interface AMapMarker {
  on(event: 'click', handler: (event: AMapMouseEvent) => void): void
  off(event: 'click', handler: (event: AMapMouseEvent) => void): void
  setContent(content: HTMLElement): void
}

export interface AMapMap {
  on(event: 'click', handler: (event: AMapMouseEvent) => void): void
  off(event: 'click', handler: (event: AMapMouseEvent) => void): void
  add(overlays: AMapMarker | AMapMarker[]): void
  remove(overlays: AMapMarker | AMapMarker[]): void
  destroy(): void
  getZoom(): number
  setZoomAndCenter(zoom: number, center: AMapPosition): void
  setFitView(overlays?: AMapMarker[], immediately?: boolean, avoid?: number[], maxZoom?: number): void
}

export interface AMapConvertResult {
  locations?: unknown
}

export interface AMapNamespace {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => AMapMap
  Marker: new (options: Record<string, unknown>) => AMapMarker
  convertFrom(
    points: AMapPosition | AMapPosition[],
    source: 'gps',
    callback: (status: string, result: AMapConvertResult) => void
  ): void
}
