import assert from 'node:assert/strict'
import test from 'node:test'
import type { CampusWalkGraph } from '../map/core/walk-graph'
import {
  estimateDurationSeconds,
  haversineMeters,
  nearestWalkNode,
  solveCampusWalkRoute,
  walkRoutePolyline
} from '../app/utils/walk-route'

test('haversine returns a sane distance for a 1-degree latitude span', () => {
  const distance = haversineMeters({ lng: 0, lat: 0 }, { lng: 0, lat: 1 })
  // ~111.2 km per degree of latitude.
  assert.ok(distance > 105_000 && distance < 116_000, `unexpected distance ${distance}`)
})

test('estimateDurationSeconds converts distance at walking speed', () => {
  assert.equal(estimateDurationSeconds(130), 100) // 1.3 m/s
  assert.equal(estimateDurationSeconds(0), 1) // at least 1s
})

test('nearestWalkNode snaps to the closest node within radius', () => {
  const graph: CampusWalkGraph = {
    nodes: [
      { id: 'a', point: { lng: 0, lat: 0, crs: 'WGS84' } },
      { id: 'b', point: { lng: 0.001, lat: 0.001, crs: 'WGS84' } }
    ],
    edges: []
  }
  assert.equal(nearestWalkNode(graph, { lng: 0.0001, lat: 0.0001 })?.id, 'a')
  assert.equal(nearestWalkNode(graph, { lng: 0.0011, lat: 0.0011 })?.id, 'b')
  // Too far away -> no node.
  assert.equal(nearestWalkNode(graph, { lng: 0.1, lat: 0.1 }), null)
})

test('empty graph falls back to an honest straight-line schematic estimate', () => {
  const origin = { lng: 0, lat: 0 }
  const dest = { lng: 0.01, lat: 0 }
  const result = solveCampusWalkRoute({ nodes: [], edges: [] }, origin, dest)
  assert.equal(result.ok, true)
  assert.equal(result.schematic, true)
  assert.equal(result.nodeIds.length, 0)
  assert.equal(result.distanceMeters, Math.round(haversineMeters(origin, dest)))
})

test('graph route uses shortest edge path and reports non-schematic', () => {
  const graph: CampusWalkGraph = {
    nodes: [
      { id: 'a', point: { lng: 0, lat: 0, crs: 'WGS84' } },
      { id: 'b', point: { lng: 0.0003, lat: 0, crs: 'WGS84' } },
      { id: 'c', point: { lng: 0.0006, lat: 0, crs: 'WGS84' } }
    ],
    edges: [
      { from: 'a', to: 'b', distanceMeters: 1000 },
      { from: 'b', to: 'c', distanceMeters: 1000 }
    ]
  }
  const result = solveCampusWalkRoute(graph, { lng: 0.00005, lat: 0 }, { lng: 0.00065, lat: 0 })
  assert.equal(result.ok, true)
  assert.equal(result.schematic, false)
  assert.deepEqual(result.nodeIds, ['a', 'b', 'c'])
  assert.equal(result.distanceMeters, 2000)
  assert.equal(result.durationSeconds, estimateDurationSeconds(2000))
})

test('dijkstra picks the short-cut when a direct edge is present', () => {
  const graph: CampusWalkGraph = {
    nodes: [
      { id: 'a', point: { lng: 0, lat: 0, crs: 'WGS84' } },
      { id: 'b', point: { lng: 0.0003, lat: 0, crs: 'WGS84' } },
      { id: 'c', point: { lng: 0.0006, lat: 0, crs: 'WGS84' } }
    ],
    edges: [
      { from: 'a', to: 'b', distanceMeters: 1000 },
      { from: 'b', to: 'c', distanceMeters: 1000 },
      { from: 'a', to: 'c', distanceMeters: 1500 }
    ]
  }
  const result = solveCampusWalkRoute(graph, { lng: 0.00005, lat: 0 }, { lng: 0.00065, lat: 0 })
  assert.equal(result.ok, true)
  // Shortest a->c is 1500 via the direct edge, not 2000 via b.
  assert.equal(result.distanceMeters, 1500)
  assert.deepEqual(result.nodeIds, ['a', 'c'])
})

test('unconnected graph falls back to a straight schematic line', () => {
  const graph: CampusWalkGraph = {
    nodes: [
      { id: 'a', point: { lng: 0, lat: 0, crs: 'WGS84' } },
      { id: 'c', point: { lng: 0.0006, lat: 0, crs: 'WGS84' } }
    ],
    edges: []
  }
  const result = solveCampusWalkRoute(graph, { lng: 0.00005, lat: 0 }, { lng: 0.00065, lat: 0 })
  assert.equal(result.ok, true)
  assert.equal(result.schematic, true)
  assert.equal(result.nodeIds.length, 0)
})

test('walkRoutePolyline returns node points in id order', () => {
  const graph: CampusWalkGraph = {
    nodes: [
      { id: 'a', point: { lng: 0, lat: 0, crs: 'WGS84' } },
      { id: 'b', point: { lng: 0.01, lat: 0, crs: 'WGS84' } }
    ],
    edges: []
  }
  const line = walkRoutePolyline(graph, ['a', 'b'])
  assert.equal(line.length, 2)
  assert.deepEqual([line[0]!.lng, line[1]!.lng], [0, 0.01])
})
