/**
 * 一次性起草脚本：基于已入库的 76 个标点（WGS84）+ OSM 边界生成校内步行图骨架。
 *
 * 生成逻辑（诚实标注，非现场核验）：
 *  - 节点：全部 amap-imported-places 标点 + 南门；
 *  - 边：K 近邻连接（每点连最近的 K 个邻居），距离阈值约束；
 *  - 所有边 kind='road'、distanceMeters 缺省（由 haversine × 系数估算）；
 *  - 整图 verificationStatus: 'draft-schematic'——边可能穿楼/穿墙，
 *    需用户（校方）抽查修正：删除假边、补充真实门/路口节点后转正。
 *
 * 用法：node --import tsx scripts/draft-campus-walk-graph.ts
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { haversineMeters } from '../app/utils/walk-route'
import { amapImportedPlaces } from '../data/seeds/amap-imported-places'
import type { CampusWalkGraph } from '../map/core/walk-graph'

const K = 3
/** 边最大长度（米）：超过视为跨区主干道，草稿阶段不自动连（避免莫须有的长路）。 */
const MAX_EDGE_METERS = 220

interface DraftNode {
  id: string
  name: string
  category: string
  lng: number
  lat: number
}

function main(): void {
  const nodes: DraftNode[] = amapImportedPlaces.map(place => ({
    id: `node-${place.id.replace('amap-import-row-', '')}`,
    name: place.name,
    category: place.category,
    lng: place.point.lng,
    lat: place.point.lat
  }))

  // KNN 无向边：去重 + 阈值。
  const edgeKeys = new Set<string>()
  const connect = (fromId: string, toId: string): void => {
    edgeKeys.add([fromId, toId].sort().join('|'))
  }
  for (const node of nodes) {
    const neighbors = nodes
      .map(other => ({ other, distance: haversineMeters({ lng: node.lng, lat: node.lat }, { lng: other.lng, lat: other.lat }) }))
      .filter(candidate => candidate.other.id !== node.id)
      .sort((left, right) => left.distance - right.distance)
      .slice(0, K)
    for (const { other, distance } of neighbors) {
      if (distance > MAX_EDGE_METERS) continue
      connect(node.id, other.id)
    }
  }

  // 分量间桥接：连通分量按最近点对相连（模拟片区之间真实存在的主干道），
  // 保证全图可达；桥接边同样待核验。
  const adjacency = new Map<string, string[]>()
  for (const node of nodes) adjacency.set(node.id, [])
  for (const key of edgeKeys) {
    const [from, to] = key.split('|')
    adjacency.get(from!)?.push(to!)
    adjacency.get(to!)?.push(from!)
  }
  const componentOf = new Map<string, number>()
  let componentCount = 0
  for (const node of nodes) {
    if (componentOf.has(node.id)) continue
    const stack = [node.id]
    while (stack.length) {
      const id = stack.pop()!
      if (componentOf.has(id)) continue
      componentOf.set(id, componentCount)
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!componentOf.has(neighbor)) stack.push(neighbor)
      }
    }
    componentCount += 1
  }
  while (componentCount > 1) {
    let best: { fromId: string, toId: string, distance: number } | null = null
    for (const node of nodes) {
      for (const other of nodes) {
        if (other.id === node.id) continue
        if (componentOf.get(node.id) === componentOf.get(other.id)) continue
        const distance = haversineMeters(
          { lng: node.lng, lat: node.lat },
          { lng: other.lng, lat: other.lat }
        )
        if (!best || distance < best.distance) {
          best = { fromId: node.id, toId: other.id, distance }
        }
      }
    }
    if (!best) break
    connect(best.fromId, best.toId)
    const merged = componentOf.get(best.toId)!
    const source = componentOf.get(best.fromId)!
    for (const [id, comp] of componentOf) {
      if (comp === merged) componentOf.set(id, source)
    }
    componentCount -= 1
  }

  const graph: CampusWalkGraph = {
    nodes: nodes.map(node => ({
      id: node.id,
      name: node.name,
      point: { lng: node.lng, lat: node.lat, crs: 'WGS84' },
      aliases: [node.name]
    })),
    edges: [...edgeKeys].map((key) => {
      const [from, to] = key.split('|')
      return { from: from!, to: to!, kind: 'road' }
    })
  }

  // 校验：连通分量、孤立节点。
  const finalAdjacency = new Map<string, string[]>()
  for (const node of graph.nodes) finalAdjacency.set(node.id, [])
  for (const edge of graph.edges) {
    finalAdjacency.get(edge.from)?.push(edge.to)
    finalAdjacency.get(edge.to)?.push(edge.from)
  }
  const isolated = graph.nodes.filter(node => (finalAdjacency.get(node.id) ?? []).length === 0)
  const seen = new Set<string>()
  const stack = [graph.nodes[0]!.id]
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    for (const neighbor of finalAdjacency.get(id) ?? []) {
      if (!seen.has(neighbor)) stack.push(neighbor)
    }
  }

  console.log(`nodes: ${graph.nodes.length}, edges: ${graph.edges.length}`)
  console.log(`isolated nodes: ${isolated.length} -> ${isolated.map(n => n.name).join(', ') || 'none'}`)
  console.log(`main component: ${seen.size}/${graph.nodes.length}`)

  const out = resolve('data/seeds/campus-walk-graph.ts')
  const json = JSON.stringify(graph, null, 2)
    .replace(/"([^"]+)":/g, '$1:')
    .replace(/'/g, '\\\'')
    .replace(/"/g, '\'')
  const content = `import type { CampusWalkGraph } from '../../map/core/walk-graph'

/**
 * 校内步行参考图（草稿骨架，数据待现场核验后转正）。
 *
 * 起草说明（scripts/draft-campus-walk-graph.ts 生成，verificationStatus: draft-schematic）：
 *  - 节点来自 amap-imported-places 的 ${graph.nodes.length} 个标点（owner-map-only，未独立核验）；
 *  - 边为 KNN(K=${K}) 连接 + ${MAX_EDGE_METERS}m 阈值，kind='road'；
 *  - 当前状态：只证明「图论路由链路可用」，边可能穿楼/穿墙、缺少真实门节点；
 *  - 转正条件（用户/校方抽查后按 docs/FIELD_COORDINATE_VERIFICATION.md 流程）：
 *    1) 删除穿楼/穿墙的假边；2) 补充真实出入口（门）节点并连到宿舍区；
 *    3) 关键路径 distanceMeters 填实测值；4) 确认后把 verificationStatus 改为 verified。
 */
export const campusWalkGraph: CampusWalkGraph = ${json}
`
  writeFileSync(out, content, 'utf8')
  console.log(`written: ${out}`)
}

main()
