import Supercluster from 'supercluster'
import type { GeoPoint, MapPoi } from '~~/map/core/types'

/**
 * supercluster 适配器：把校园 POI 载荷进 Mapbox `supercluster` 分级索引，
 * 提供按缩放档位查询聚合簇/单点以及「簇展开缩放」。纯逻辑、可单测，不依赖 DOM。
 *
 * 坐标系约定：POI 坐标为 WGS84；由调用方把示意地图的 scale 映射为「合成 zoom」后查询。
 * 未引入任何 GCJ-02 反向转换，遵守项目坐标纪律。
 */

export interface CampusClusterOptions {
  /** 聚合半径（像素）。 */
  radius: number
  /** 至少多少点才成簇。 */
  minPoints: number
  /** 最大合成 zoom；达到后全部为单点。 */
  maxZoom: number
  /** 每档 tile 尺寸（像素），supercluster 内部用，默认 512。 */
  extent: number
}

export interface SyntheticCluster {
  clusterId: number
  centroid: GeoPoint
  count: number
}

export interface CampusClusterQuery {
  clusters: SyntheticCluster[]
  /** 未被聚合为簇的单点 poi id（按当前 zoom）。 */
  singlePoiIds: string[]
}

export interface CampusClusterBBox {
  west: number
  south: number
  east: number
  north: number
}

interface LoadedPoint {
  poiId: string
  /** supercluster 运行时会给单点写 `cluster: false`；类型上标记可空用于判别。 */
  cluster?: false
}

export class CampusClusterIndex {
  private index: Supercluster<LoadedPoint> | null = null
  private readonly options: CampusClusterOptions

  constructor(options: CampusClusterOptions) {
    this.options = options
  }

  /** 用当前 POI 重建索引（数据变化时调用）。 */
  build(pois: readonly MapPoi[]): void {
    const features: Array<import('supercluster').PointFeature<LoadedPoint>> = []
    for (const poi of pois) {
      if (!Number.isFinite(poi.point.lng) || !Number.isFinite(poi.point.lat)) continue
      features.push({
        type: 'Feature',
        properties: { poiId: poi.id, cluster: false },
        geometry: { type: 'Point', coordinates: [poi.point.lng, poi.point.lat] }
      })
    }
    const index = new Supercluster<LoadedPoint>({
      radius: this.options.radius,
      minPoints: this.options.minPoints,
      maxZoom: this.options.maxZoom,
      extent: this.options.extent
    })
    index.load(features)
    this.index = index
  }

  /** 查询某一缩放档位下 bbox 内的聚合簇与单点。 */
  query(bbox: CampusClusterBBox, zoom: number): CampusClusterQuery {
    const index = this.index
    if (!index) return { clusters: [], singlePoiIds: [] }
    const clusters: SyntheticCluster[] = []
    const singlePoiIds: string[] = []
    const items = index.getClusters([bbox.west, bbox.south, bbox.east, bbox.north], zoom)
    for (const item of items) {
      const props = item.properties
      if (props.cluster) {
        const coordinates = item.geometry.coordinates
        clusters.push({
          clusterId: props.cluster_id,
          centroid: { lng: coordinates[0], lat: coordinates[1], crs: 'WGS84' },
          count: props.point_count
        })
      } else if (props.poiId) {
        singlePoiIds.push(props.poiId)
      }
    }
    return { clusters, singlePoiIds }
  }

  /** 点击簇后应放大到的 zoom（该档簇散开为成员）。 */
  expansionZoom(clusterId: number): number {
    return this.index?.getClusterExpansionZoom(clusterId) ?? this.options.maxZoom
  }
}
