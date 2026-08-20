import assert from 'node:assert/strict'
import test from 'node:test'
import type { MapPoi } from '../map/core/types'
import { CampusClusterIndex } from '../app/utils/campus-cluster'

const BBOX = { west: 118.59, south: 25.10, east: 118.62, north: 25.13 }

function makePois(count: number, spacing = 0.00005): MapPoi[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `p${index}`,
    category: 'campus-building',
    status: 'draft',
    point: { lng: 118.605 + index * spacing, lat: 25.112, crs: 'WGS84' }
  }))
}

function build(count: number): CampusClusterIndex {
  const index = new CampusClusterIndex({ radius: 48, minPoints: 2, maxZoom: 20, extent: 512 })
  index.build(makePois(count))
  return index
}

test('low zoom merges many points into a single cluster', () => {
  const index = build(20)
  const { clusters, singlePoiIds } = index.query(BBOX, 14)
  assert.equal(singlePoiIds.length, 0)
  assert.ok(clusters.length >= 1)
  assert.ok(clusters.some(cluster => cluster.count > 1))
})

test('high zoom breaks clusters apart toward individual points', () => {
  const index = build(20)
  const low = index.query(BBOX, 14)
  const high = index.query(BBOX, 19)
  // 放大后总簇数不会更少、单点会更多。
  assert.ok(high.singlePoiIds.length >= low.singlePoiIds.length)
  assert.ok(high.clusters.length >= low.clusters.length)
})

test('centroids are WGS84 in campus bounds and count matches', () => {
  const index = build(20)
  const { clusters } = index.query(BBOX, 14)
  for (const cluster of clusters) {
    assert.equal(cluster.centroid.crs, 'WGS84')
    assert.ok(cluster.centroid.lng >= BBOX.west && cluster.centroid.lng <= BBOX.east)
    assert.ok(cluster.centroid.lat >= BBOX.south && cluster.centroid.lat <= BBOX.north)
    assert.ok(cluster.count >= 2)
  }
})

test('expansion zoom is a valid zoom above the query zoom (click-to-zoom)', () => {
  const index = build(20)
  const { clusters } = index.query(BBOX, 14)
  assert.ok(clusters.length > 0)
  const zoom = index.expansionZoom(clusters[0]!.clusterId)
  assert.ok(Number.isInteger(zoom))
  assert.ok(zoom > 14)
})

test('before build, query returns empty without throwing', () => {
  const index = build(1)
  index.build([])
  assert.deepEqual(index.query(BBOX, 14), { clusters: [], singlePoiIds: [] })
})
