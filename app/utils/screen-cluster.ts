import type { MapPoi } from '~~/map/core/types'

/**
 * 屏幕空间坐标映射：把 WGS84 点换算为当前视图下的屏幕像素坐标。
 * 由 provider 提供（标记点已在同一坐标系定位），让聚类在真实屏幕密度下进行。
 */
export interface PointViewTransform {
  lngToX(lng: number): number
  latToY(lat: number): number
}

export interface ScreenspaceCluster {
  /** 成员质心（屏幕像素）。 */
  centroidX: number
  centroidY: number
  count: number
  poiIds: string[]
}

export interface ClusterOptions {
  /** 网格边长（像素）。 */
  cellPx: number
  /** 达到该数量才视为聚合点，低于则保持为普通标点。 */
  minGroup: number
}

export const DEFAULT_CLUSTER_CELL_PX = 48
export const DEFAULT_CLUSTER_MIN_GROUP = 2

/**
 * 屏幕空间网格分桶聚合（借鉴 supercluster / leaflet.markercluster 的分层贪心
 * 网格分桶思想，自研轻量实现，无外部依赖）。校园尺度几十个点无需 KD-Tree，
 * 按当前屏幕像素做固定网格分桶即可表达数量（对齐交互规范 §4.5 数字聚合语义）。
 *
 * 只返回达到 minGroup 的聚合簇；未达到的普通点由调用方按原样渲染。
 */
export function clusterForView(
  pois: readonly MapPoi[],
  view: PointViewTransform,
  options: ClusterOptions = { cellPx: DEFAULT_CLUSTER_CELL_PX, minGroup: DEFAULT_CLUSTER_MIN_GROUP }
): ScreenspaceCluster[] {
  const cell = Math.max(1, options.cellPx)
  const minGroup = Math.max(1, options.minGroup)

  const buckets = new Map<string, { sumX: number, sumY: number, ids: string[] }>()
  for (const poi of pois) {
    if (!Number.isFinite(poi.point.lng) || !Number.isFinite(poi.point.lat)) continue
    const x = view.lngToX(poi.point.lng)
    const y = view.latToY(poi.point.lat)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    const key = `${Math.floor(x / cell)},${Math.floor(y / cell)}`
    const bucket = buckets.get(key) ?? { sumX: 0, sumY: 0, ids: [] }
    bucket.sumX += x
    bucket.sumY += y
    bucket.ids.push(poi.id)
    buckets.set(key, bucket)
  }

  const clusters: ScreenspaceCluster[] = []
  for (const bucket of buckets.values()) {
    if (bucket.ids.length < minGroup) continue
    clusters.push({
      centroidX: bucket.sumX / bucket.ids.length,
      centroidY: bucket.sumY / bucket.ids.length,
      count: bucket.ids.length,
      poiIds: bucket.ids
    })
  }
  return clusters
}
