import type { CampusWalkGraph } from '../../map/core/walk-graph'
import { EMPTY_CAMPUS_WALK_GRAPH } from '../../map/core/walk-graph'

/**
 * 校内步行参考图（schema 就绪，数据待现场核验后填充）。
 *
 * 本项目对地点坐标执行严格的现场核验纪律（详见 docs/MAP_DATA_READINESS.md、docs/FIELD_COORDINATE_VERIFICATION.md）：
 * 正式发布前坐标必须经独立现场核验。offline/WebView provider 的本地图论路线会读取本图做
 * Dijkstra 最短路径；在数据未核验前保持为空，路由求解回退到「示意图直线估算」
 * （见 app/utils/walk-route.ts），不臆造校园路径几何，也不把未核验坐标冒充为实测路径。
 *
 * 填充约定（现场核验完成后按数据维护流程补充）：
 *  - node.point 必须为 WGS84；坐标来源与核验记录需随数据一并记录；
 *  - edge.distanceMeters 优先填实测值；缺省由 haversine × 路径系数估算；
 *  - 边连接两节点 id，无向；kind 可选 path/road/stairs/elevator。
 */
export const campusWalkGraph: CampusWalkGraph = EMPTY_CAMPUS_WALK_GRAPH
