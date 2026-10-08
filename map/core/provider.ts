import type { GeoPoint, MapArea, MapMountOptions, MapPoi } from './types'

export type PointPickedHandler = (point: GeoPoint) => void
export type PoiSelectHandler = (poi: MapPoi | null) => void
export type AreaSelectHandler = (area: MapArea | null) => void
export type MapErrorHandler = (error: Error) => void
export type MapProviderId = 'maplibre-dev' | 'amap' | 'offline'
export type MapBaseStyle = 'standard' | 'satellite'
export type MapLabelSize = 'extra-small' | 'small' | 'medium' | 'large'

export interface MapDisplayOptions {
  showPois: boolean
  showAreas: boolean
  showLabels: boolean
  autoCluster: boolean
  labelSize: MapLabelSize
}

/** 路口级步行指引的一条（高德 Walking step 摘要）。 */
export interface MapRouteStep {
  instruction: string
  distanceMeters: number
}

export interface RouteSummary {
  distanceMeters: number
  durationSeconds: number
  /** 转弯/沿路指引（可能为空：插件未返回或旧数据）。 */
  steps?: MapRouteStep[]
}

/** 用户实时位置（浏览器 geolocation 返回 WGS84）。 */
export interface MapUserLocation {
  point: GeoPoint
  /** 定位精度半径（米），用于绘制精度圈。 */
  accuracyMeters?: number
}

export interface MapProvider {
  readonly id: MapProviderId
  mount(element: HTMLElement, options?: MapMountOptions): Promise<void>
  setPois(pois: MapPoi[]): void
  setAreas(areas: MapArea[]): void
  setDisplayOptions(options: MapDisplayOptions): void
  setBaseStyle(style: MapBaseStyle): boolean
  resize(): void
  fitToPois(): void
  enablePointPicker(handler: PointPickedHandler): void
  disablePointPicker(): void
  setSelectedPoi(id: string | null): void
  setSelectedArea(id: string | null): void
  flyToPoi(id: string): boolean
  flyToPoint(point: GeoPoint, zoom?: number): boolean
  /** 显示/更新「我的位置」蓝点与精度圈；传 null 清除。 */
  setUserLocation(location: MapUserLocation | null): void
  planWalkingRoute(origin: GeoPoint, destination: GeoPoint): Promise<RouteSummary>
  searchVisiblePois(query: string): Promise<MapPoi[]>
  clearRoute(): void
  onPoiSelect(handler: PoiSelectHandler): () => void
  onAreaSelect(handler: AreaSelectHandler): () => void
  onError(handler: MapErrorHandler): () => void
  destroy(): void
}
