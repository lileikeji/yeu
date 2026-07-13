import assert from 'node:assert/strict'
import test from 'node:test'
import { campusMapReferencePlaces } from '../data/seeds/preview-places'
import type { ApiPlace } from '../shared/types/server'
import { mergePublicMapPlaces } from '../app/utils/public-catalog'

function publishedPlace(id: string, name: string): ApiPlace {
  const timestamp = '2026-07-13T00:00:00.000Z'
  return {
    id,
    slug: id,
    name,
    summary: `${name} 已核验地点`,
    body: '',
    scope: 'campus',
    type: 'service',
    category: 'service',
    address: null,
    campusArea: null,
    floor: null,
    room: null,
    longitude: 118.605,
    latitude: 25.115,
    coordinateSystem: 'WGS84',
    coordinateVerification: 'verified',
    coordinateVerifiedAt: timestamp,
    navigationAvailable: true,
    openingHours: null,
    phone: null,
    website: null,
    externalMapUrl: null,
    isOfficial: true,
    isFeatured: false,
    status: 'published',
    lastVerifiedAt: timestamp,
    publishedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    sources: []
  }
}

test('official campus diagram index keeps all 47 text-only numbered entries', () => {
  assert.equal(campusMapReferencePlaces.length, 47)
  assert.deepEqual(
    campusMapReferencePlaces.map(place => place.mapNumber),
    Array.from({ length: 47 }, (_, index) => String(index + 1).padStart(2, '0'))
  )
  assert.equal(new Set(campusMapReferencePlaces.map(place => place.id)).size, 47)
  assert.equal(new Set(campusMapReferencePlaces.map(place => place.name)).size, 47)

  for (const place of campusMapReferencePlaces) {
    assert.equal('point' in place, false)
    assert.equal('longitude' in place, false)
    assert.equal('latitude' in place, false)
  }

  const networkCenter = campusMapReferencePlaces.find(place => place.mapNumber === '16')
  assert.equal(networkCenter?.name, '网络中心')
  assert.ok(networkCenter?.aliases?.includes('网络信息中心'))
})

test('published alias names replace their official text-only reference entries', () => {
  const aliases = [
    ['治安保卫处', '校保卫处'],
    ['网络中心', '网络信息中心'],
    ['祥贤教学楼', '祥贤楼']
  ] as const
  const published = aliases.map(([, alias], index) => publishedPlace(`published-alias-${index + 1}`, alias))
  const merged = mergePublicMapPlaces(campusMapReferencePlaces, published)

  assert.equal(merged.length, campusMapReferencePlaces.length)
  for (const [officialName, alias] of aliases) {
    assert.equal(merged.some(place => place.name === officialName), false)
    const replacement = merged.find(place => place.name === alias)
    assert.ok(replacement?.pointIsVerified)
    assert.equal(replacement?.usesPreviewPoint, false)
    assert.ok(replacement?.searchText.includes(officialName))
    assert.ok(replacement?.searchText.includes(alias))
  }
})
