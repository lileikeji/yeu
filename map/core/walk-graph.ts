import type { GeoPoint } from './types'

/**
 * 校内步行参考图（WebView/offline provider 的本地图论步行路线数据源）。
 *
 * 本图为「能力降级」用途：不依赖高德在线服务，也不缓存任何第三方瓦片/SDK。
 * 节点坐标一律使用 WGS84，与数据库核验后的坐标同源；绝不引入 GCJ-02 反向转换。
 */
export interface WalkNode {
  id: string
  name?: string
  /** WGS84 地理坐标。 */
  point: GeoPoint
  /** 与 POI 绑定的别名，便于将来吸附时复用已核验地点名。 */
  aliases?: string[]
}

export interface WalkEdge {
  from: string
  to: string
  /** 实测距离（米）。缺省时由 haversine × 路径系数估算。 */
  distanceMeters?: number
  kind?: 'path' | 'road' | 'stairs' | 'elevator'
}

export interface CampusWalkGraph {
  nodes: WalkNode[]
  edges: WalkEdge[]
}

/** 空图默认值：数据未现场核验前保持为空，路由求解回退到示意图直线估算。 */
export const EMPTY_CAMPUS_WALK_GRAPH: CampusWalkGraph = { nodes: [], edges: [] }
