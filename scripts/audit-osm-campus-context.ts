import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import campusBoundary from '../data/seeds/osm-campus-boundary.json'
import {
  YEU_CAMPUS_REFERENCE_BOUNDS,
  YEU_OSM_RELATION_ID,
  YEU_OSM_RELATION_URL
} from '../map/core/campus'

type Position = [number, number]

interface OsmNode {
  type: 'node'
  id: number
  version?: number
  timestamp?: string
  changeset?: number
  lat: number
  lon: number
  tags?: Record<string, string>
}
interface OsmWay {
  type: 'way'
  id: number
  version?: number
  timestamp?: string
  changeset?: number
  nodes: number[]
  tags?: Record<string, string>
}

interface OsmRelation {
  type: 'relation'
  id: number
  version?: number
  timestamp?: string
  changeset?: number
  tags?: Record<string, string>
}

export interface OsmMapPayload {
  version?: string
  generator?: string
  elements: Array<OsmNode | OsmWay | OsmRelation | Record<string, unknown>>
}

interface BoundaryFeature {
  geometry: {
    type: 'MultiPolygon'
    coordinates: Position[][][]
  }
}

export interface OsmCampusContextFeature {
  osmType: 'node' | 'way'
  osmId: number
  osmVersion: number | null
  sourceUpdatedAt: string | null
  changeset: number | null
  name: string | null
  sourceTag: string | null
  categories: Array<'building' | 'road' | 'entrance' | 'amenity'>
  geometryKind: 'point' | 'line' | 'polygon'
}

const API_BBOX = [
  YEU_CAMPUS_REFERENCE_BOUNDS.west,
  YEU_CAMPUS_REFERENCE_BOUNDS.south,
  YEU_CAMPUS_REFERENCE_BOUNDS.east,
  YEU_CAMPUS_REFERENCE_BOUNDS.north
].join(',')

export const OSM_CAMPUS_CONTEXT_API_URL = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${API_BBOX}`

function assertAudit(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function isNode(value: unknown): value is OsmNode {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Partial<OsmNode>
  return candidate.type === 'node'
    && Number.isInteger(candidate.id)
    && Number.isFinite(candidate.lat)
    && Number.isFinite(candidate.lon)
}

function isWay(value: unknown): value is OsmWay {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Partial<OsmWay>
  return candidate.type === 'way'
    && Number.isInteger(candidate.id)
    && Array.isArray(candidate.nodes)
    && candidate.nodes.every(nodeId => Number.isInteger(nodeId))
}

function isRelation(value: unknown): value is OsmRelation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Partial<OsmRelation>
  return candidate.type === 'relation' && Number.isInteger(candidate.id)
}

function pointOnSegment(point: Position, start: Position, end: Position): boolean {
  const epsilon = 1e-12
  const cross = (end[0] - start[0]) * (point[1] - start[1])
    - (end[1] - start[1]) * (point[0] - start[0])
  if (Math.abs(cross) > epsilon) return false
  return point[0] >= Math.min(start[0], end[0]) - epsilon
    && point[0] <= Math.max(start[0], end[0]) + epsilon
    && point[1] >= Math.min(start[1], end[1]) - epsilon
    && point[1] <= Math.max(start[1], end[1]) + epsilon
}

function orientation(a: Position, b: Position, c: Position): -1 | 0 | 1 {
  const cross = (b[0] - a[0]) * (c[1] - a[1])
    - (b[1] - a[1]) * (c[0] - a[0])
  if (Math.abs(cross) <= 1e-12) return 0
  return cross > 0 ? 1 : -1
}

function segmentsIntersect(a: Position, b: Position, c: Position, d: Position): boolean {
  const abc = orientation(a, b, c)
  const abd = orientation(a, b, d)
  const cda = orientation(c, d, a)
  const cdb = orientation(c, d, b)
  if (abc !== abd && cda !== cdb) return true
  return (abc === 0 && pointOnSegment(c, a, b))
    || (abd === 0 && pointOnSegment(d, a, b))
    || (cda === 0 && pointOnSegment(a, c, d))
    || (cdb === 0 && pointOnSegment(b, c, d))
}

function pointInRing(point: Position, ring: Position[]): boolean {
  let inside = false
  for (let currentIndex = 0, previousIndex = ring.length - 1;
    currentIndex < ring.length;
    previousIndex = currentIndex++) {
    const current = ring[currentIndex]!
    const previous = ring[previousIndex]!
    if (pointOnSegment(point, previous, current)) return true
    const crossesLatitude = (current[1] > point[1]) !== (previous[1] > point[1])
    if (!crossesLatitude) continue
    const crossingLongitude = (previous[0] - current[0])
      * (point[1] - current[1]) / (previous[1] - current[1]) + current[0]
    if (point[0] < crossingLongitude) inside = !inside
  }
  return inside
}

function pointInPolygon(point: Position, polygon: Position[][]): boolean {
  const outer = polygon[0]
  if (!outer || !pointInRing(point, outer)) return false
  return !polygon.slice(1).some(hole => pointInRing(point, hole))
}

function pointInCampus(point: Position, boundary: BoundaryFeature): boolean {
  return boundary.geometry.coordinates.some(polygon => pointInPolygon(point, polygon))
}

function featureIntersectsCampus(points: Position[], boundary: BoundaryFeature): boolean {
  if (points.some(point => pointInCampus(point, boundary))) return true

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!
    const end = points[index]!
    for (const polygon of boundary.geometry.coordinates) {
      for (const ring of polygon) {
        for (let ringIndex = 1; ringIndex < ring.length; ringIndex += 1) {
          if (segmentsIntersect(start, end, ring[ringIndex - 1]!, ring[ringIndex]!)) return true
        }
      }
    }
  }

  const closed = points.length >= 4
    && points[0]![0] === points.at(-1)![0]
    && points[0]![1] === points.at(-1)![1]
  return closed && boundary.geometry.coordinates.some(polygon => polygon[0]?.some(point => pointInRing(point, points)))
}

function contextCategories(tags: Record<string, string> | undefined): OsmCampusContextFeature['categories'] {
  if (!tags) return []
  const categories: OsmCampusContextFeature['categories'] = []
  if (tags.building) categories.push('building')
  if (tags.highway) categories.push('road')
  if (tags.entrance) categories.push('entrance')
  if (tags.amenity) categories.push('amenity')
  return categories
}

function countCategory(features: OsmCampusContextFeature[], category: OsmCampusContextFeature['categories'][number]): number {
  return features.filter(feature => feature.categories.includes(category)).length
}

export function auditOsmCampusContext(
  payload: OsmMapPayload,
  options: {
    boundary?: BoundaryFeature
    retrievedAt?: string
  } = {}
) {
  assertAudit(payload && Array.isArray(payload.elements), 'OSM map response has no elements array')
  const boundary = options.boundary ?? campusBoundary as BoundaryFeature
  assertAudit(boundary.geometry.type === 'MultiPolygon', 'Campus boundary must be a MultiPolygon')
  const nodes = new Map(payload.elements.filter(isNode).map(node => [node.id, node]))
  const relation = payload.elements.filter(isRelation)
    .find(item => item.id === YEU_OSM_RELATION_ID)
  assertAudit(relation, `OSM map response does not contain campus relation ${YEU_OSM_RELATION_ID}`)
  assertAudit(relation.tags?.name === '仰恩大学', 'OSM campus relation name changed')

  const features: OsmCampusContextFeature[] = []
  for (const node of nodes.values()) {
    const categories = contextCategories(node.tags)
    if (!categories.length || !pointInCampus([node.lon, node.lat], boundary)) continue
    features.push({
      osmType: 'node',
      osmId: node.id,
      osmVersion: node.version ?? null,
      sourceUpdatedAt: node.timestamp ?? null,
      changeset: node.changeset ?? null,
      name: node.tags?.name ?? null,
      sourceTag: node.tags?.source ?? null,
      categories,
      geometryKind: 'point'
    })
  }

  for (const way of payload.elements.filter(isWay)) {
    const categories = contextCategories(way.tags)
    if (!categories.length) continue
    const points = way.nodes.map((nodeId) => {
      const node = nodes.get(nodeId)
      assertAudit(node, `OSM way ${way.id} references missing node ${nodeId}`)
      return [node.lon, node.lat] as Position
    })
    if (!featureIntersectsCampus(points, boundary)) continue
    const closed = points.length >= 4
      && points[0]![0] === points.at(-1)![0]
      && points[0]![1] === points.at(-1)![1]
    features.push({
      osmType: 'way',
      osmId: way.id,
      osmVersion: way.version ?? null,
      sourceUpdatedAt: way.timestamp ?? null,
      changeset: way.changeset ?? null,
      name: way.tags?.name ?? null,
      sourceTag: way.tags?.source ?? null,
      categories,
      geometryKind: closed ? 'polygon' : 'line'
    })
  }

  features.sort((left, right) => left.osmType.localeCompare(right.osmType) || left.osmId - right.osmId)
  const buildings = countCategory(features, 'building')
  const roads = countCategory(features, 'road')
  const entrances = countCategory(features, 'entrance')
  const amenities = countCategory(features, 'amenity')
  const namedBuildings = features.filter(feature => feature.name && feature.categories.includes('building')).length
  const namedEntrances = features.filter(feature => feature.name && feature.categories.includes('entrance')).length
  const timestamps = features.map(feature => feature.sourceUpdatedAt)
    .filter((value): value is string => value !== null)
    .sort()

  return {
    schemaVersion: 1,
    retrievedAt: options.retrievedAt ?? new Date().toISOString(),
    source: {
      apiUrl: OSM_CAMPUS_CONTEXT_API_URL,
      relationUrl: YEU_OSM_RELATION_URL,
      relationId: YEU_OSM_RELATION_ID,
      relationVersion: relation.version ?? null,
      relationUpdatedAt: relation.timestamp ?? null,
      license: 'ODbL-1.0',
      licenseUrl: 'https://www.openstreetmap.org/copyright',
      attribution: '© OpenStreetMap contributors'
    },
    verificationScope: 'community-context-only',
    coordinateSemantics: 'WGS84-reference-geometry-not-navigation-points',
    counts: {
      contextFeatures: features.length,
      buildings,
      namedBuildings,
      roads,
      entrances,
      namedEntrances,
      amenities
    },
    freshness: {
      oldestFeatureUpdatedAt: timestamps[0] ?? null,
      newestFeatureUpdatedAt: timestamps.at(-1) ?? null
    },
    supportsBuildingEntranceNavigation: buildings > 0 && entrances > 0,
    features
  }
}

export async function fetchOsmCampusContextAudit() {
  const response = await fetch(OSM_CAMPUS_CONTEXT_API_URL, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'YEU-Freshman-Guide/0.1 (https://gitee.com/lilei1529/yeu)'
    }
  })
  assertAudit(response.ok, `OSM map API returned HTTP ${response.status}`)
  return auditOsmCampusContext(await response.json() as OsmMapPayload)
}

const executedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false

if (executedDirectly) {
  try {
    process.stdout.write(`${JSON.stringify(await fetchOsmCampusContextAudit(), null, 2)}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
