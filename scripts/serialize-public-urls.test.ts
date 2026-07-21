import assert from 'node:assert/strict'
import test from 'node:test'
import { serializePlace, serializeSource } from '../server/utils/serializers'
import type { places, sources } from '../server/database/schema'

function sourceRow(url: string): typeof sources.$inferSelect {
  return {
    id: 'src-1',
    title: 'Source',
    url,
    platform: 'web',
    publisherName: 'Pub',
    sourceLevel: 'official',
    isOfficial: true,
    publishedAt: null,
    accessedAt: Date.now(),
    status: 'active',
    notes: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}

function placeRow(overrides: Partial<typeof places.$inferSelect> = {}): typeof places.$inferSelect {
  return {
    id: 'place-1',
    slug: 'demo',
    name: 'Demo',
    summary: 'Summary',
    body: '',
    scope: 'campus',
    type: 'building',
    category: null,
    address: null,
    campusArea: null,
    floor: null,
    room: null,
    longitude: 118.0,
    latitude: 25.0,
    coordinateSystem: 'GCJ-02',
    coordinateVerification: 'verified',
    coordinateVerifiedAt: Date.now(),
    coordinatePointRole: null,
    sourceRawRef: null,
    openingHours: null,
    phone: null,
    website: 'https://example.com',
    externalMapUrl: 'https://map.example.com/x',
    isOfficial: true,
    isFeatured: false,
    status: 'published',
    lastVerifiedAt: Date.now(),
    publishedAt: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides
  }
}

test('public serializeSource blanks unsafe URLs', () => {
  const safe = serializeSource(sourceRow('https://www.yeu.edu.cn/page'))
  assert.equal(safe.url, 'https://www.yeu.edu.cn/page')

  const loopback = serializeSource(sourceRow('http://127.0.0.1/admin'))
  assert.equal(loopback.url, '')

  const admin = serializeSource(sourceRow('http://127.0.0.1/admin'), false)
  assert.equal(admin.url, 'http://127.0.0.1/admin')
})

test('public serializePlace nulls unsafe website and map URLs', () => {
  const publicPlace = serializePlace(placeRow({
    website: 'http://169.254.169.254/latest/meta-data/',
    externalMapUrl: 'javascript:alert(1)'
  }), [sourceRow('http://192.168.1.1/')], false)

  assert.equal(publicPlace.website, null)
  assert.equal(publicPlace.externalMapUrl, null)
  assert.equal(publicPlace.sources[0]?.url, '')

  const adminPlace = serializePlace(placeRow({
    website: 'http://169.254.169.254/latest/meta-data/',
    externalMapUrl: 'http://192.168.0.1/map'
  }), [sourceRow('http://192.168.1.1/')], true)

  assert.equal(adminPlace.website, 'http://169.254.169.254/latest/meta-data/')
  assert.equal(adminPlace.externalMapUrl, 'http://192.168.0.1/map')
  assert.equal(adminPlace.sources[0]?.url, 'http://192.168.1.1/')
})
