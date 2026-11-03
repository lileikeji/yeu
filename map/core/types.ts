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
  address?: string
  source?: 'catalog' | 'amap-native'
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

/** 校车线路的一个站点（序即站序，起点在前）。 */
export interface MapBusStop {
  id: string
  name: string
  point: GeoPoint
  /** 线路起点站（YKT is_first_site）。 */
  isOrigin: boolean
  /** 线路终点站（YKT is_end_site）。 */
  isDestination: boolean
}

/** 校车线路（沿路折线 + 起终点标注）。 */
/** 校外公交的在途车辆（掌上公交实时 GPS，GCJ-02）。 */
export interface MapTransitVehicle {
  /** 唯一键，建议 `车牌-线路-方向`。 */
  id: string
  /** 线路号，如 `K2`。 */
  line: string
  plate: string
  nextStation: string
  point: GeoPoint
  /** 与线路一致的配色。 */
  color?: string
  /** 车头朝向（正北 0°，顺时针），用于让车形跟着线路转向。 */
  angleDeg?: number
}

/** 校园减速带（WGS-84）：叮叮车路过要踩到近 0，地图上单独一层图标。 */
export interface MapSpeedBump {
  /** 唯一键，如 `bump-7`。 */
  id: string
  /** 序号（现场标注表里的 id）。 */
  label: string
  point: GeoPoint
}

export interface MapBusRoute {
  id: string
  name: string
  stops: MapBusStop[]
  /**
   * 沿实际道路的走向折线（服务端高德算路，WGS84）。
   * 空/缺失时 provider 回退站点直连。
   */
  polyline?: GeoPoint[]
  /** 覆盖默认线路配色（往返合并为单线时指定保留色）。 */
  color?: string
}

/** 校车实时位置（来自云一卡通 YKTGetBusCarInfo 轮询）。 */
export interface MapBus {
  id: string
  name: string
  point: GeoPoint
  /** 车辆当前是否已到站（YKT is_at_site）。 */
  isAtSite: boolean
  /** 车辆当前关联站点名（可为空）。 */
  siteName?: string
  /** 所属线路名（如「旧区--新区」）。 */
  routeName?: string
  /** 数据采集时刻（ISO 字符串）。 */
  updatedAt?: string
  /** 客户端认定「位置真的变了」的时刻（毫秒）；不变就保持旧值，用来算定位多久没更新。 */
  movedAt?: number
  /** 车头朝向（正北 0°，顺时针；缺省不旋转）。 */
  angleDeg?: number
}

export interface MapMountOptions {
  center?: GeoPoint
  zoom?: number
}
