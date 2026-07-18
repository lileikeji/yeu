import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import type { ApiCoordinateObservation, ApiPlace } from '../shared/types/server'
import {
  buildCoordinateReviewAccuracyCircle,
  buildCoordinateReviewPointCollection,
  buildEmptyReviewFeatureCollection,
  collectReviewMapFitPoints,
  hasRenderableWgs84Coordinates,
  isCurrentCoordinateNotDisplayable,
  isVerifiedRenderableWgs84Place,
  resolveCurrentPlacePoint,
  resolveCurrentPlacePointLabel,
  resolveReviewMapFitDecision,
  selectNeighboringReviewPlaces
} from '../app/utils/admin-coordinate-review-map-presentation'

const componentSource = readFileSync(
  resolve('app/components/admin/AdminCoordinateReviewMap.vue'),
  'utf8'
)
const utilSource = readFileSync(
  resolve('app/utils/admin-coordinate-review-map-presentation.ts'),
  'utf8'
)

function place(overrides: Partial<ApiPlace> = {}): ApiPlace {
  return {
    id: 'place-id',
    slug: 'place',
    name: '测试地点',
    summary: '',
    body: '',
    scope: 'campus',
    type: 'building',
    category: null,
    address: null,
    campusArea: null,
    floor: null,
    room: null,
    longitude: 118.6,
    latitude: 24.9,
    coordinateSystem: 'WGS84',
    coordinateVerification: 'unverified',
    coordinateVerifiedAt: null,
    coordinatePointRole: 'main-entrance',
    navigationAvailable: false,
    openingHours: null,
    phone: null,
    website: null,
    externalMapUrl: null,
    isOfficial: true,
    isFeatured: false,
    status: 'published',
    lastVerifiedAt: null,
    publishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    sources: [],
    ...overrides
  }
}

function observation(
  overrides: Partial<ApiCoordinateObservation> = {}
): ApiCoordinateObservation {
  return {
    id: 'observation-id',
    clientObservationId: null,
    placeId: 'place-id',
    placeName: '测试地点',
    placeScope: 'campus',
    longitude: 118.601,
    latitude: 24.901,
    coordinateSystem: 'WGS84',
    accuracyMeters: 12,
    sampleCount: 2,
    samples: [
      { longitude: 118.6005, latitude: 24.9005, accuracyMeters: 10, capturedAt: '2026-01-01T00:00:00.000Z' },
      { longitude: 118.6015, latitude: 24.9015, accuracyMeters: 14, capturedAt: '2026-01-01T00:00:01.000Z' }
    ],
    captureMethod: 'gps',
    pointRole: 'main-entrance',
    capturedAt: '2026-01-01T00:00:00.000Z',
    evidenceNote: '',
    outsideCampusReviewBounds: false,
    reviewStatus: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    supersededByObservationId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  } as ApiCoordinateObservation
}

test('admin coordinate review map is a thin shell over presentation util', () => {
  assert.match(componentSource, /from ['"]~~\/app\/utils\/admin-coordinate-review-map-presentation['"]/)
  assert.match(componentSource, /resolveCurrentPlacePoint/)
  assert.match(componentSource, /selectNeighboringReviewPlaces/)
  assert.match(componentSource, /buildCoordinateReviewPointCollection/)
  assert.match(componentSource, /buildCoordinateReviewAccuracyCircle/)
  assert.match(componentSource, /resolveReviewMapFitDecision/)
  assert.doesNotMatch(componentSource, /function hasRenderableWgs84Coordinates/)
  assert.doesNotMatch(componentSource, /function distanceMeters/)
  assert.doesNotMatch(componentSource, /EARTH_RADIUS_METERS/)
  assert.match(utilSource, /coordinateDistanceMeters/)
})

test('renderable WGS84 guards reject incomplete or non-WGS84 places', () => {
  assert.equal(hasRenderableWgs84Coordinates(place()), true)
  assert.equal(hasRenderableWgs84Coordinates(place({ longitude: null })), false)
  assert.equal(hasRenderableWgs84Coordinates(place({ coordinateSystem: 'GCJ-02' })), false)
  assert.equal(isVerifiedRenderableWgs84Place(place()), false)
  assert.equal(isVerifiedRenderableWgs84Place(place({ coordinateVerification: 'verified' })), true)
})

test('current place point and label decisions stay pure', () => {
  assert.deepEqual(resolveCurrentPlacePoint(place()), { longitude: 118.6, latitude: 24.9 })
  assert.equal(resolveCurrentPlacePoint(place({ coordinateSystem: 'GCJ-02' })), null)
  assert.equal(resolveCurrentPlacePointLabel(place({ coordinateVerification: 'verified' })), '当前已确认坐标')
  assert.equal(resolveCurrentPlacePointLabel(place()), '第一次确认的坐标')
  assert.equal(isCurrentCoordinateNotDisplayable(place({ coordinateSystem: 'GCJ-02' })), true)
  assert.equal(isCurrentCoordinateNotDisplayable(place()), false)
})

test('neighbor selection keeps same scope, verified WGS84, distance order and limit', () => {
  const places = [
    place({ id: 'place-id', name: 'self' }),
    place({
      id: 'near',
      name: '近邻',
      longitude: 118.6012,
      latitude: 24.9011,
      coordinateVerification: 'verified'
    }),
    place({
      id: 'far',
      name: '远邻',
      longitude: 118.62,
      latitude: 24.92,
      coordinateVerification: 'verified'
    }),
    place({
      id: 'unverified',
      name: '未核验',
      longitude: 118.6011,
      latitude: 24.901,
      coordinateVerification: 'unverified'
    }),
    place({
      id: 'nearby-scope',
      name: '周边',
      scope: 'nearby',
      longitude: 118.601,
      latitude: 24.901,
      coordinateVerification: 'verified'
    })
  ]

  const neighbors = selectNeighboringReviewPlaces({
    observation: observation(),
    places,
    limit: 1
  })

  assert.equal(neighbors.length, 1)
  assert.equal(neighbors[0]?.place.id, 'near')
  assert.ok((neighbors[0]?.distance ?? 0) > 0)
})

test('point collection includes samples, result, current and neighbors', () => {
  const collection = buildCoordinateReviewPointCollection({
    observation: observation(),
    currentPlacePoint: { longitude: 118.6, latitude: 24.9 },
    currentPlacePointLabel: '当前双重核验坐标',
    neighboringPlaces: [{ place: place({ id: 'near', name: '近邻', coordinateVerification: 'verified' }) }]
  })

  assert.equal(collection.type, 'FeatureCollection')
  assert.equal(collection.features.length, 5)
  assert.deepEqual(
    collection.features.map(feature => feature.properties.kind),
    ['sample', 'sample', 'result', 'current', 'neighbor']
  )
  assert.equal(collection.features[0]?.properties.label, '样本 1')
  assert.equal(collection.features[2]?.properties.label, '计算结果')
  assert.equal(collection.features[3]?.properties.label, '当前双重核验坐标')
  assert.equal(collection.features[4]?.properties.label, '近邻')
  assert.deepEqual(buildEmptyReviewFeatureCollection(), { type: 'FeatureCollection', features: [] })
})

test('accuracy circle closes as a polygon with minimum radius and segments', () => {
  const circle = buildCoordinateReviewAccuracyCircle({
    longitude: 118.6,
    latitude: 24.9,
    accuracyMeters: 0,
    segments: 8
  })
  const ring = circle.features[0]?.geometry.coordinates[0]
  assert.equal(circle.features[0]?.geometry.type, 'Polygon')
  assert.equal(ring?.length, 9)
  assert.deepEqual(ring?.[0], ring?.[ring.length - 1])
})

test('fit decision flies to a single point and bounds multi-point spreads', () => {
  const single = resolveReviewMapFitDecision([{ longitude: 118.6, latitude: 24.9 }])
  assert.equal(single.kind, 'fly-to')
  if (single.kind === 'fly-to') {
    assert.deepEqual(single.center, [118.6, 24.9])
    assert.equal(single.zoom, 18)
  }

  const multiPoints = collectReviewMapFitPoints({
    samples: observation().samples,
    observation: observation(),
    currentPlacePoint: { longitude: 118.6, latitude: 24.9 },
    neighboringPlaces: [{ place: place({ id: 'near', longitude: 118.62, latitude: 24.92 }) }]
  })
  const multi = resolveReviewMapFitDecision(multiPoints)
  assert.equal(multi.kind, 'fit-bounds')
  if (multi.kind === 'fit-bounds') {
    assert.equal(multi.padding, 52)
    assert.equal(multi.maxZoom, 18)
    assert.ok(multi.bounds[0][0] < multi.bounds[1][0])
    assert.ok(multi.bounds[0][1] < multi.bounds[1][1])
  }

  assert.equal(resolveReviewMapFitDecision([]).kind, 'none')
})
