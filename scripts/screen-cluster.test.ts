import assert from 'node:assert/strict'
import test from 'node:test'
import type { MapPoi } from '../map/core/types'
import { clusterForView } from '../app/utils/screen-cluster'

const POIS = (...ids: Array<[id: string, x: number, y: number]>): MapPoi[] => ids.map(([id, x, y]) => ({
  id,
  name: id,
  category: 'campus-building',
  point: { lng: x, lat: y, crs: 'WGS84' },
  status: 'draft'
}))

const VIEW = {
  lngToX: (lng: number) => lng * 1000,
  latToY: (lat: number) => lat * 1000
}

test('points in the same grid cell merge into one cluster', () => {
  const pois = POIS(['p1', 0.001, 0.001], ['p2', 0.0012, 0.0012])
  const clusters = clusterForView(pois, VIEW, { cellPx: 48, minGroup: 2 })
  assert.equal(clusters.length, 1)
  assert.equal(clusters[0]!.count, 2)
  assert.deepEqual(clusters[0]!.poiIds.sort(), ['p1', 'p2'])
})

test('points below minGroup stay as singletons (not clustered)', () => {
  const pois = POIS(['p1', 0.001, 0.001], ['p2', 0.5, 0.5])
  const clusters = clusterForView(pois, VIEW, { cellPx: 48, minGroup: 2 })
  assert.equal(clusters.length, 0)
})

test('minGroup threshold controls which buckets aggregate', () => {
  const pois = POIS(['p1', 0.001, 0.001], ['p2', 0.0012, 0.0012], ['p3', 0.5, 0.5])
  // p3 alone in its own cell, below minGroup -> only the two-点 cell clusters.
  const clusters = clusterForView(pois, VIEW, { cellPx: 48, minGroup: 2 })
  assert.equal(clusters.length, 1)
  assert.equal(clusters[0]!.count, 2)
})

test('distant cells keep separate clusters with correct centroid', () => {
  const pois = POIS(
    ['a1', 0.001, 0.001], ['a2', 0.0012, 0.0012],
    ['b1', 0.5, 0.5], ['b2', 0.5002, 0.5002]
  )
  const clusters = clusterForView(pois, VIEW, { cellPx: 48, minGroup: 2 })
  assert.equal(clusters.length, 2)
  const xs = clusters.map(c => c.centroidX).sort((a, b) => a - b)
  assert.ok(xs[0]! < 10)
  assert.ok(xs[1]! > 400)
})

test('invalid or non-finite points are skipped', () => {
  const pois: MapPoi[] = [
    ...POIS(['p1', 0.001, 0.001], ['p2', 0.0012, 0.0012]),
    { id: 'bad', name: 'bad', category: 'campus-building', point: { lng: Number.NaN, lat: 0, crs: 'WGS84' }, status: 'draft' }
  ]
  const clusters = clusterForView(pois, VIEW, { cellPx: 48, minGroup: 2 })
  assert.equal(clusters.length, 1)
  assert.equal(clusters[0]!.count, 2)
})
