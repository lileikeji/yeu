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

export interface AMapHotspotEvent extends AMapMouseEvent {
  id?: string
  name?: string
  lnglat?: AMapLngLat
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

export interface AMapPolygon {
  setMap(map: AMapMap | null): void
}

export interface AMapWalkingResult {
  routes?: Array<{
    distance?: number
    time?: number
  }>
}

export interface AMapWalking {
  search(
    origin: AMapPosition,
    destination: AMapPosition,
    callback: (status: string, result: AMapWalkingResult | string) => void
  ): void
  clear(): void
}

export type AMapOverlay = AMapMarker | AMapPolygon

export interface AMapInfoWindow {
  setContent(content: HTMLElement): void
  open(map: AMapMap, position: AMapPosition): void
  close(): void
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
  on(event: 'hotspotclick', handler: (event: AMapHotspotEvent) => void): void
  off(event: 'hotspotclick', handler: (event: AMapHotspotEvent) => void): void
  add(overlays: AMapOverlay | AMapOverlay[]): void
  remove(overlays: AMapOverlay | AMapOverlay[]): void
  destroy(): void
  getZoom(): number
  setZoomAndCenter(zoom: number, center: AMapPosition): void
  setFitView(overlays?: Array<AMapMarker | AMapPolygon>, immediately?: boolean, avoid?: number[], maxZoom?: number): void
}

export interface AMapConvertResult {
  locations?: unknown
}

export interface AMapNamespace {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => AMapMap
  Marker: new (options: Record<string, unknown>) => AMapMarker
  Polygon: new (options: Record<string, unknown>) => AMapPolygon
  InfoWindow: new (options?: Record<string, unknown>) => AMapInfoWindow
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
  Walking: new (options: Record<string, unknown>) => AMapWalking
  plugin(plugins: string[], callback: () => void): void
  convertFrom(
    points: AMapPosition | AMapPosition[],
    source: 'gps',
    callback: (status: string, result: AMapConvertResult) => void
  ): void
}
