export type AMapPosition = [number, number]

export interface AMapPixel {
  getX?(): number
  getY?(): number
}

export interface AMapLngLat {
  getLng(): number
  getLat(): number
}
export interface AMapMouseEvent {
  originEvent?: Event
}

export interface AMapMarkerClusterData {
  lnglat: AMapPosition
  weight?: number
  poiId: string
}

export interface AMapMarkerRenderContext {
  marker: AMapMarker
  data?: AMapMarkerClusterData | AMapMarkerClusterData[]
}

export interface AMapClusterRenderContext {
  count: number
  marker: AMapMarker
  clusterData?: AMapMarkerClusterData[]
}

export interface AMapMarkerClusterEvent extends AMapMouseEvent {
  clusterData?: AMapMarkerClusterData[]
}

export interface AMapMarker {
  on(event: 'click', handler: (event: AMapMouseEvent) => void): void
  off(event: 'click', handler: (event: AMapMouseEvent) => void): void
  setContent(content: HTMLElement): void
  setOffset(offset: AMapPixel): void
}

export interface AMapMarkerCluster {
  on(event: 'click', handler: (event: AMapMarkerClusterEvent) => void): void
  off(event: 'click', handler: (event: AMapMarkerClusterEvent) => void): void
  setData(data: AMapMarkerClusterData[]): void
  setMap(map: AMapMap | null): void
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
  Pixel: new (x: number, y: number) => AMapPixel
  MarkerCluster: new (
    map: AMapMap,
    data: AMapMarkerClusterData[],
    options?: {
      gridSize?: number
      maxZoom?: number
      averageCenter?: boolean
      clusterByZoomChange?: boolean
      renderMarker?: (context: AMapMarkerRenderContext) => void
      renderClusterMarker?: (context: AMapClusterRenderContext) => void
    }
  ) => AMapMarkerCluster
  plugin(plugins: string[], callback: () => void): void
  convertFrom(
    points: AMapPosition | AMapPosition[],
    source: 'gps',
    callback: (status: string, result: AMapConvertResult) => void
  ): void
}
