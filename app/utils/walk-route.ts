import type { GeoPoint } from '~~/map/core/types'
import type { CampusWalkGraph, WalkEdge, WalkNode } from '~~/map/core/walk-graph'

const EARTH_RADIUS_METERS = 6_371_000

/** 步行速度（米/秒），用于把路线距离换算成预计时长。 */
export const WALK_SPEED_METERS_PER_SECOND = 1.3

/** 起终点最大吸附半径（米）：超出后视作无最近图节点。 */
export const DEFAULT_MAX_SNAP_RADIUS_METERS = 80

/**
 * 各边的路径系数：缺省边距离 = haversine 直线距离 × 该系数，近似真实步行绕行。
 * 有实测 distanceMeters 的边优先用实测值。
 */
const PATH_FACTOR_BY_KIND: Record<NonNullable<WalkEdge['kind']>, number> = {
  path: 1.15,
  road: 1.1,
  stairs: 1.6,
  elevator: 0.9
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/** 两个 WGS84 点之间的大圆距离（米）。 */
export function haversineMeters(a: Pick<GeoPoint, 'lng' | 'lat'>, b: Pick<GeoPoint, 'lng' | 'lat'>): number {
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(s))
}

/** 距离 → 预计步行秒数（至少 1 秒）。 */
export function estimateDurationSeconds(distanceMeters: number): number {
  return Math.max(1, Math.round(distanceMeters / WALK_SPEED_METERS_PER_SECOND))
}

/** 解析一条边的实际距离（优先实测，缺省 haversine × 路径系数）。 */
function edgeDistanceMeters(graph: CampusWalkGraph, edge: WalkEdge): number {
  if (typeof edge.distanceMeters === 'number' && edge.distanceMeters > 0) {
    return edge.distanceMeters
  }
  const from = graph.nodes.find(node => node.id === edge.from)
  const to = graph.nodes.find(node => node.id === edge.to)
  if (!from || !to) return Number.POSITIVE_INFINITY
  const factor = PATH_FACTOR_BY_KIND[edge.kind ?? 'path']
  return haversineMeters(from.point, to.point) * factor
}

function buildAdjacency(graph: CampusWalkGraph): Map<string, Array<{ to: string, distance: number }>> {
  const adjacency = new Map<string, Array<{ to: string, distance: number }>>()
  for (const node of graph.nodes) adjacency.set(node.id, [])
  for (const edge of graph.edges) {
    const distance = edgeDistanceMeters(graph, edge)
    if (!Number.isFinite(distance)) continue
    adjacency.get(edge.from)?.push({ to: edge.to, distance })
    adjacency.get(edge.to)?.push({ to: edge.from, distance })
  }
  return adjacency
}

/**
 * 朴素 Dijkstra（校园图规模小，O(V²) 足够且无需排序堆）。
 * 返回起点到终点的节点 id 序列；不可达返回 null。
 */
function shortestNodePath(graph: CampusWalkGraph, startId: string, goalId: string): string[] | null {
  const adj = buildAdjacency(graph)
  const distances = new Map<string, number>()
  const previous = new Map<string, string | null>()
  const unvisited = new Set<string>()

  for (const node of graph.nodes) {
    distances.set(node.id, Number.POSITIVE_INFINITY)
    previous.set(node.id, null)
    unvisited.add(node.id)
  }
  if (!distances.has(startId) || !distances.has(goalId)) return null

  distances.set(startId, 0)
  while (unvisited.size > 0) {
    let current: string | null = null
    let best = Number.POSITIVE_INFINITY
    for (const id of unvisited) {
      const candidate = distances.get(id) ?? Number.POSITIVE_INFINITY
      if (candidate < best) {
        best = candidate
        current = id
      }
    }
    if (current === null) break
    if (current === goalId) break
    unvisited.delete(current)

    const currentDistance = distances.get(current) ?? Number.POSITIVE_INFINITY
    if (!Number.isFinite(currentDistance)) break
    for (const neighbor of adj.get(current) ?? []) {
      if (!unvisited.has(neighbor.to)) continue
      const candidate = currentDistance + neighbor.distance
      if (candidate < (distances.get(neighbor.to) ?? Number.POSITIVE_INFINITY)) {
        distances.set(neighbor.to, candidate)
        previous.set(neighbor.to, current)
      }
    }
  }

  if (!Number.isFinite(distances.get(goalId))) return null
  const path: string[] = []
  let cursor: string | null = goalId
  while (cursor) {
    path.push(cursor)
    cursor = previous.get(cursor) ?? null
  }
  path.reverse()
  return path
}

/** 把坐标点吸附到最近的图节点；超过最大半径返回 null。 */
export function nearestWalkNode(
  graph: CampusWalkGraph,
  point: Pick<GeoPoint, 'lng' | 'lat'>,
  maxRadiusMeters: number = DEFAULT_MAX_SNAP_RADIUS_METERS
): WalkNode | null {
  let best: WalkNode | null = null
  let bestDistance = maxRadiusMeters
  for (const node of graph.nodes) {
    const distance = haversineMeters(point, node.point)
    if (distance <= bestDistance) {
      best = node
      bestDistance = distance
    }
  }
  return best
}

export interface WalkRouteResult {
  ok: true
  /** 路程（米）。 */
  distanceMeters: number
  /** 预计步行时长（秒）。 */
  durationSeconds: number
  /** 经过的图节点 id 序列；空表示未走图（示意图直线估算）。 */
  nodeIds: string[]
  /** true = 无可用图/不可达时的直线示意估算，非实测路径。 */
  schematic: boolean
}

/**
 * 求解起终点步行路线。
 *
 * 优先走校内步行图做 Dijkstra 最短路径；当图为空、起终点无法吸附或图中不可达时，
 * 诚实回退为「示意图直线估算」（不臆造校园路径几何）。始终返回成功结果，便于
 * WebView 下提供最低限度的距离/时长示意。
 */
export function solveCampusWalkRoute(
  graph: CampusWalkGraph,
  origin: Pick<GeoPoint, 'lng' | 'lat'>,
  destination: Pick<GeoPoint, 'lng' | 'lat'>
): WalkRouteResult {
  const straightLine = Math.round(haversineMeters(origin, destination))

  if (graph.nodes.length === 0) {
    return {
      ok: true,
      distanceMeters: Math.max(0, straightLine),
      durationSeconds: estimateDurationSeconds(straightLine),
      nodeIds: [],
      schematic: true
    }
  }

  const start = nearestWalkNode(graph, origin)
  const goal = nearestWalkNode(graph, destination)

  if (!start || !goal) {
    return {
      ok: true,
      distanceMeters: Math.max(0, straightLine),
      durationSeconds: estimateDurationSeconds(straightLine),
      nodeIds: [],
      schematic: true
    }
  }

  if (start.id === goal.id) {
    return {
      ok: true,
      distanceMeters: Math.max(0, straightLine),
      durationSeconds: estimateDurationSeconds(straightLine),
      nodeIds: [start.id],
      schematic: true
    }
  }

  const path = shortestNodePath(graph, start.id, goal.id)
  if (!path) {
    return {
      ok: true,
      distanceMeters: Math.max(0, straightLine),
      durationSeconds: estimateDurationSeconds(straightLine),
      nodeIds: [],
      schematic: true
    }
  }

  let distance = 0
  for (let index = 0; index < path.length - 1; index += 1) {
    const currentId = path[index]!
    const nextId = path[index + 1]!
    const edge = graph.edges.find(candidate => (
      (candidate.from === currentId && candidate.to === nextId)
      || (candidate.from === nextId && candidate.to === currentId)
    ))
    const fromNode = graph.nodes.find(node => node.id === currentId)!
    const toNode = graph.nodes.find(node => node.id === nextId)!
    distance += edge ? edgeDistanceMeters(graph, edge) : haversineMeters(fromNode.point, toNode.point)
  }

  const total = Math.max(0, Math.round(distance))
  return {
    ok: true,
    distanceMeters: total,
    durationSeconds: estimateDurationSeconds(total),
    nodeIds: path,
    schematic: false
  }
}

/** 把图节点 id 序列还原为 WGS84 折线；结果为空时调用方可直接画起点→终点直线。 */
export function walkRoutePolyline(graph: CampusWalkGraph, nodeIds: string[]): GeoPoint[] {
  const byId = new Map(graph.nodes.map(node => [node.id, node]))
  const points: GeoPoint[] = []
  for (const id of nodeIds) {
    const node = byId.get(id)
    if (node) points.push(node.point)
  }
  return points
}
