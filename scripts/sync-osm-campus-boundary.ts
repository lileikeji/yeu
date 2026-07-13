import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  YEU_CAMPUS_REFERENCE_BOUNDS,
  YEU_OSM_RELATION_ID,
  YEU_OSM_RELATION_URL,
  type GeoBounds
} from '../map/core/campus'

const DEFAULT_OUTPUT_PATH = 'data/seeds/osm-campus-boundary.json'
const OSM_API_URL = `https://api.openstreetmap.org/api/0.6/relation/${YEU_OSM_RELATION_ID}/full.json`
const GEOMETRY_EPSILON = 1e-12

interface OsmNode {
  type: 'node'
  id: number
  lat: number
  lon: number
}

interface OsmWay {
  type: 'way'
  id: number
  version?: number
  timestamp?: string
  nodes: number[]
}

interface OsmRelationMember {
  type: string
  ref: number
  role: string
}

interface OsmRelation {
  type: 'relation'
  id: number
  version?: number
  timestamp?: string
  members: OsmRelationMember[]
  tags?: Record<string, string>
}

interface OsmPayload {
  elements: Array<OsmNode | OsmWay | OsmRelation | Record<string, unknown>>
}

interface CampusBoundaryFeature {
  type: 'Feature'
  properties: {
    name: string
    osmRelationId: number
    osmRelationVersion: number | null
    osmWayIds: number[]
    osmWayVersions: Array<number | null>
    sourceUrl: string
    sourceApiUrl: string
    license: 'ODbL-1.0'
    licenseUrl: 'https://www.openstreetmap.org/copyright'
    sourceUpdatedAt: string | null
    retrievedAt: string
    verificationScope: 'campus-boundary-only'
  }
  geometry: {
    type: 'MultiPolygon'
    coordinates: number[][][][]
  }
}

interface BuildOptions {
  relationId?: number
  sourceUrl?: string
  sourceApiUrl?: string
  expectedBounds?: GeoBounds
  retrievedAt?: string
}

function assertBoundary(condition: unknown, message: string): asserts condition {
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
  return candidate.type === 'relation'
    && Number.isInteger(candidate.id)
    && Array.isArray(candidate.members)
}

function boundsForCoordinates(coordinates: number[][][][]): GeoBounds {
  const points = coordinates.flat(2)
  assertBoundary(points.length > 0, 'Campus boundary contains no coordinates')
  return {
    west: Math.min(...points.map(point => point[0]!)),
    south: Math.min(...points.map(point => point[1]!)),
    east: Math.max(...points.map(point => point[0]!)),
    north: Math.max(...points.map(point => point[1]!))
  }
}

function assertExpectedBounds(actual: GeoBounds, expected: GeoBounds): void {
  const tolerance = 0.0000001
  for (const key of ['west', 'south', 'east', 'north'] as const) {
    assertBoundary(
      Math.abs(actual[key] - expected[key]) <= tolerance,
      `OSM campus boundary ${key} changed from the reviewed value; inspect the relation before updating`
    )
  }
}

function signedRingArea(ring: number[][]): number {
  const origin = ring[0]!
  return ring.slice(0, -1).reduce((area, point, index) => {
    const next = ring[index + 1]!
    const pointX = point[0]! - origin[0]!
    const pointY = point[1]! - origin[1]!
    const nextX = next[0]! - origin[0]!
    const nextY = next[1]! - origin[1]!
    return area + pointX * nextY - nextX * pointY
  }, 0) / 2
}

function orientation(a: number[], b: number[], c: number[]): -1 | 0 | 1 {
  const cross = (b[0]! - a[0]!) * (c[1]! - a[1]!)
    - (b[1]! - a[1]!) * (c[0]! - a[0]!)
  if (Math.abs(cross) <= GEOMETRY_EPSILON) return 0
  return cross > 0 ? 1 : -1
}

function pointOnSegment(point: number[], start: number[], end: number[]): boolean {
  return point[0]! >= Math.min(start[0]!, end[0]!) - GEOMETRY_EPSILON
    && point[0]! <= Math.max(start[0]!, end[0]!) + GEOMETRY_EPSILON
    && point[1]! >= Math.min(start[1]!, end[1]!) - GEOMETRY_EPSILON
    && point[1]! <= Math.max(start[1]!, end[1]!) + GEOMETRY_EPSILON
}

function segmentsIntersect(a: number[], b: number[], c: number[], d: number[]): boolean {
  const abc = orientation(a, b, c)
  const abd = orientation(a, b, d)
  const cda = orientation(c, d, a)
  const cdb = orientation(c, d, b)

  if (abc !== abd && cda !== cdb) return true
  if (abc === 0 && pointOnSegment(c, a, b)) return true
  if (abd === 0 && pointOnSegment(d, a, b)) return true
  if (cda === 0 && pointOnSegment(a, c, d)) return true
  return cdb === 0 && pointOnSegment(b, c, d)
}

function counterClockwiseRing(ring: number[][], wayId: number): number[][] {
  const signedArea = signedRingArea(ring)
  assertBoundary(Math.abs(signedArea) > GEOMETRY_EPSILON, `OSM way ${wayId} has zero area`)

  const segmentCount = ring.length - 1
  for (let index = 0; index < segmentCount; index += 1) {
    const start = ring[index]!
    const end = ring[index + 1]!
    assertBoundary(
      start[0] !== end[0] || start[1] !== end[1],
      `OSM way ${wayId} contains a zero-length segment`
    )

    for (let otherIndex = index + 1; otherIndex < segmentCount; otherIndex += 1) {
      const adjacent = otherIndex === index + 1
        || (index === 0 && otherIndex === segmentCount - 1)
      if (adjacent) continue

      assertBoundary(
        !segmentsIntersect(start, end, ring[otherIndex]!, ring[otherIndex + 1]!),
        `OSM way ${wayId} self-intersects`
      )
    }
  }

  return signedArea > 0 ? ring : [...ring].reverse()
}

export function buildCampusBoundaryFeature(
  payload: OsmPayload,
  options: BuildOptions = {}
): CampusBoundaryFeature {
  assertBoundary(payload && Array.isArray(payload.elements), 'OSM response has no elements array')
  const relationId = options.relationId ?? YEU_OSM_RELATION_ID
  const relations = payload.elements.filter(isRelation).filter(item => item.id === relationId)
  assertBoundary(relations.length === 1, `Expected exactly one OSM relation ${relationId}`)
  const relation = relations[0]!
  assertBoundary(relation.tags?.type === 'multipolygon', 'Campus relation must remain a multipolygon')
  assertBoundary(relation.tags?.name === '仰恩大学', 'Campus relation name changed; review before syncing')

  const outerMembers = relation.members.filter(member => member.type === 'way' && member.role === 'outer')
  const unsupportedMembers = relation.members.filter(member => member.type !== 'way' || member.role !== 'outer')
  assertBoundary(outerMembers.length > 0, 'Campus relation has no outer ways')
  assertBoundary(unsupportedMembers.length === 0, 'Campus relation gained inner or unsupported members; update the parser deliberately')

  const nodes = new Map(payload.elements.filter(isNode).map(node => [node.id, node]))
  const ways = new Map(payload.elements.filter(isWay).map(way => [way.id, way]))
  const orderedWays: OsmWay[] = []
  const coordinates = outerMembers.map((member) => {
    const way = ways.get(member.ref)
    assertBoundary(way, `OSM relation references missing way ${member.ref}`)
    orderedWays.push(way)
    assertBoundary(way.nodes.length >= 4, `OSM way ${way.id} has too few nodes for a polygon`)
    assertBoundary(way.nodes[0] === way.nodes.at(-1), `OSM way ${way.id} is not a closed polygon`)
    const ring = way.nodes.map((nodeId) => {
      const node = nodes.get(nodeId)
      assertBoundary(node, `OSM way ${way.id} references missing node ${nodeId}`)
      return [node.lon, node.lat]
    })
    return [counterClockwiseRing(ring, way.id)]
  })

  const actualBounds = boundsForCoordinates(coordinates)
  if (options.expectedBounds) assertExpectedBounds(actualBounds, options.expectedBounds)

  return {
    type: 'Feature',
    properties: {
      name: relation.tags.name,
      osmRelationId: relation.id,
      osmRelationVersion: relation.version ?? null,
      osmWayIds: orderedWays.map(way => way.id),
      osmWayVersions: orderedWays.map(way => way.version ?? null),
      sourceUrl: options.sourceUrl ?? YEU_OSM_RELATION_URL,
      sourceApiUrl: options.sourceApiUrl ?? OSM_API_URL,
      license: 'ODbL-1.0',
      licenseUrl: 'https://www.openstreetmap.org/copyright',
      sourceUpdatedAt: relation.timestamp ?? null,
      retrievedAt: options.retrievedAt ?? new Date().toISOString().slice(0, 10),
      verificationScope: 'campus-boundary-only'
    },
    geometry: {
      type: 'MultiPolygon',
      coordinates
    }
  }
}

export async function syncCampusBoundary(outputPath = DEFAULT_OUTPUT_PATH): Promise<{
  changed: boolean
  outputPath: string
  polygonCount: number
}> {
  const response = await fetch(OSM_API_URL, {
    headers: {
      'User-Agent': 'YEU-Freshman-Guide/0.1 (https://gitee.com/lilei1529/yeu)'
    }
  })
  assertBoundary(response.ok, `OSM API returned HTTP ${response.status}`)
  const payload = await response.json() as OsmPayload
  const feature = buildCampusBoundaryFeature(payload, {
    expectedBounds: YEU_CAMPUS_REFERENCE_BOUNDS
  })
  const target = resolve(outputPath)
  const serialized = `${JSON.stringify(feature, null, 2)}\n`
  const changed = !existsSync(target) || readFileSync(target, 'utf8') !== serialized
  if (changed) writeFileSync(target, serialized, 'utf8')
  return {
    changed,
    outputPath: target,
    polygonCount: feature.geometry.coordinates.length
  }
}

const executedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false

if (executedDirectly) {
  try {
    const result = await syncCampusBoundary(process.argv[2] || DEFAULT_OUTPUT_PATH)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
