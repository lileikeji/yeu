import assert from 'node:assert/strict'
import test from 'node:test'
import { auditOsmCampusContext, type OsmMapPayload } from './audit-osm-campus-context'

const boundary = {
  geometry: {
    type: 'MultiPolygon' as const,
    coordinates: [[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]] as [number, number][][][]
  }
}

function payload(extraElements: OsmMapPayload['elements']): OsmMapPayload {
  return {
    version: '0.6',
    elements: [
      {
        type: 'relation',
        id: 17_685_756,
        version: 3,
        timestamp: '2024-09-02T13:42:22Z',
        tags: { name: '仰恩大学', type: 'multipolygon' }
      },
      ...extraElements
    ]
  }
}

test('audits only OSM context geometry that intersects the reviewed campus boundary', () => {
  const report = auditOsmCampusContext(payload([
    { type: 'node', id: 1, lon: -1, lat: 5 },
    { type: 'node', id: 2, lon: 11, lat: 5 },
    { type: 'node', id: 3, lon: 2, lat: 2 },
    { type: 'node', id: 4, lon: 4, lat: 2 },
    { type: 'node', id: 5, lon: 4, lat: 4 },
    { type: 'node', id: 6, lon: 2, lat: 4 },
    {
      type: 'node', id: 7, lon: 3, lat: 2, version: 2,
      timestamp: '2026-01-01T00:00:00Z', tags: { entrance: 'main', name: '正门' }
    },
    {
      type: 'node', id: 8, lon: 20, lat: 20,
      tags: { amenity: 'hospital', name: '范围外地点' }
    },
    {
      type: 'way', id: 100, nodes: [1, 2], version: 1,
      timestamp: '2015-07-11T00:00:00Z', tags: { highway: 'tertiary', source: 'bing' }
    },
    {
      type: 'way', id: 101, nodes: [3, 4, 5, 6, 3], version: 4,
      timestamp: '2025-01-01T00:00:00Z', tags: { building: 'yes', name: '测试楼' }
    }
  ]), { boundary, retrievedAt: '2026-07-14T00:00:00Z' })

  assert.deepEqual(report.counts, {
    contextFeatures: 3,
    buildings: 1,
    namedBuildings: 1,
    roads: 1,
    entrances: 1,
    namedEntrances: 1,
    amenities: 0
  })
  assert.equal(report.supportsBuildingEntranceNavigation, true)
  assert.equal(report.freshness.oldestFeatureUpdatedAt, '2015-07-11T00:00:00Z')
  assert.equal(report.freshness.newestFeatureUpdatedAt, '2026-01-01T00:00:00Z')
  assert.equal(report.features.some(feature => feature.name === '范围外地点'), false)
  for (const feature of report.features) {
    for (const coordinateKey of ['coordinates', 'lat', 'lon', 'lng', 'latitude', 'longitude']) {
      assert.equal(coordinateKey in feature, false)
    }
  }
  assert.equal(report.coordinateSemantics, 'WGS84-reference-geometry-not-navigation-points')
})
test('does not claim navigation support from roads or generic amenities alone', () => {
  const report = auditOsmCampusContext(payload([
    { type: 'node', id: 1, lon: 5, lat: 5, tags: { amenity: 'theatre', name: '剧场' } },
    { type: 'node', id: 2, lon: 5, lat: 6 },
    { type: 'way', id: 100, nodes: [1, 2], tags: { highway: 'service' } }
  ]), { boundary })

  assert.equal(report.counts.buildings, 0)
  assert.equal(report.counts.entrances, 0)
  assert.equal(report.supportsBuildingEntranceNavigation, false)
  assert.equal(report.verificationScope, 'community-context-only')
})

test('rejects incomplete way geometry instead of silently producing a partial audit', () => {
  assert.throws(
    () => auditOsmCampusContext(payload([
      { type: 'node', id: 1, lon: 5, lat: 5 },
      { type: 'way', id: 100, nodes: [1, 999], tags: { highway: 'service' } }
    ]), { boundary }),
    /references missing node 999/
  )
})
