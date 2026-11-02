import type { GeoPoint, MapArea, MapBus, MapBusRoute, MapMountOptions, MapPoi, MapSpeedBump, MapTransitVehicle } from './types'

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
  /** 显示/更新校车实时位置标点（动态图层，按 id 增量更新）；传空数组清除。 */
  setBuses(buses: MapBus[]): void
  /** 显示/更新校车线路（站点折线 + 起终点标注）；传空数组清除。 */
  setBusRoutes(routes: MapBusRoute[]): void
  /**
   * 显示/更新校外公交线路（K2/K6 这类静态线路，独立图层）。
   * 与校车的 5 s 轮询分开维护，互不覆盖；传空数组清除。
   * 未实现的 provider 由调用方跳过。
   */
  setTransitRoutes?(routes: MapBusRoute[]): void

  /** 校外公交在途车辆（可选能力；不实现就不显示车辆层）。 */
  setTransitVehicles?(vehicles: MapTransitVehicle[]): void
  /** 校园减速带图标层（校车 ETA 的限速依据）。 */
  setSpeedBumps?(bumps: MapSpeedBump[]): void
  planWalkingRoute(origin: GeoPoint, destination: GeoPoint): Promise<RouteSummary>
  searchVisiblePois(query: string): Promise<MapPoi[]>
  clearRoute(): void
  onPoiSelect(handler: PoiSelectHandler): () => void
  onAreaSelect(handler: AreaSelectHandler): () => void
  onError(handler: MapErrorHandler): () => void
  destroy(): void
}
