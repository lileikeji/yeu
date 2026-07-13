import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCampusBoundaryFeature } from './sync-osm-campus-boundary'

function fixtureForRing(points: Array<[number, number]>) {
  return {
    elements: [
      ...points.map(([lon, lat], index) => ({
        type: 'node' as const,
        id: index + 1,
        lon,
        lat
      })),
      {
        type: 'way' as const,
        id: 10,
        nodes: [...points.map((_, index) => index + 1), 1]
      },
      {
        type: 'relation' as const,
        id: 99,
        version: 3,
        timestamp: '2026-07-13T00:00:00Z',
        members: [{ type: 'way', ref: 10, role: 'outer' }],
        tags: { type: 'multipolygon', name: '仰恩大学' }
      }
    ]
  }
}

function fixture() {
  return fixtureForRing([
    [118.60, 25.11],
    [118.61, 25.11],
    [118.61, 25.12],
    [118.60, 25.12]
  ])
}

test('builds a deterministic campus-only GeoJSON multipolygon', () => {
  const feature = buildCampusBoundaryFeature(fixture(), {
    relationId: 99,
    sourceUrl: 'https://www.openstreetmap.org/relation/99',
    sourceApiUrl: 'https://api.openstreetmap.org/relation/99/full.json',
    retrievedAt: '2026-07-13'
  })

  assert.equal(feature.type, 'Feature')
  assert.equal(feature.geometry.type, 'MultiPolygon')
  assert.deepEqual(feature.geometry.coordinates, [[[
    [118.60, 25.11],
    [118.61, 25.11],
    [118.61, 25.12],
    [118.60, 25.12],
    [118.60, 25.11]
  ]]])
  assert.equal(feature.properties.verificationScope, 'campus-boundary-only')
  assert.equal(feature.properties.license, 'ODbL-1.0')
  assert.equal(feature.properties.licenseUrl, 'https://www.openstreetmap.org/copyright')
  assert.equal(feature.properties.retrievedAt, '2026-07-13')
  assert.equal(feature.properties.osmRelationVersion, 3)
  assert.deepEqual(feature.properties.osmWayIds, [10])
})

test('normalizes clockwise OSM outer ways to RFC 7946 counter-clockwise rings', () => {
  const clockwise = fixture()
  clockwise.elements[4] = { type: 'way' as const, id: 10, nodes: [1, 4, 3, 2, 1] }
  const feature = buildCampusBoundaryFeature(clockwise, { relationId: 99 })
  assert.deepEqual(feature.geometry.coordinates[0]![0], [
    [118.60, 25.11],
    [118.61, 25.11],
    [118.61, 25.12],
    [118.60, 25.12],
    [118.60, 25.11]
  ])
})

test('rejects open ways and unsupported relation members', () => {
  const openWay = fixture()
  openWay.elements[4] = { type: 'way' as const, id: 10, nodes: [1, 2, 3, 4] }
  assert.throws(
    () => buildCampusBoundaryFeature(openWay, { relationId: 99 }),
    /not a closed polygon/
  )

  const innerMember = fixture()
  const relation = innerMember.elements[5]
  if (relation.type === 'relation') relation.members[0]!.role = 'inner'
  assert.throws(
    () => buildCampusBoundaryFeature(innerMember, { relationId: 99 }),
    /no outer ways/
  )
})

test('rejects a zero-area butterfly even when its bounds match the reviewed campus bounds', () => {
  const expectedBounds = {
    west: 118.5944155,
    south: 25.1036816,
    east: 118.6158472,
    north: 25.1204755
  }
  const butterfly = fixtureForRing([
    [expectedBounds.west, expectedBounds.south],
    [expectedBounds.east, expectedBounds.north],
    [expectedBounds.west, expectedBounds.north],
    [expectedBounds.east, expectedBounds.south]
  ])

  assert.throws(
    () => buildCampusBoundaryFeature(butterfly, { relationId: 99, expectedBounds }),
    /zero area/
  )
})

test('rejects non-zero-area self-intersecting rings', () => {
  const crossing = fixtureForRing([
    [118.600, 25.110],
    [118.604, 25.110],
    [118.600, 25.113],
    [118.604, 25.113],
    [118.600, 25.111]
  ])

  assert.throws(
    () => buildCampusBoundaryFeature(crossing, { relationId: 99 }),
    /self-intersects/
  )
})
