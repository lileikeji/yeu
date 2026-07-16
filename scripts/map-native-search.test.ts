import assert from 'node:assert/strict'
import test from 'node:test'
import type { MapPoi } from '../map/core/types'
import type { PublicMapPlace } from '../app/utils/public-catalog'
import {
  buildNativeSearchPlaces,
  createNativeMapPlace,
  createNativeSearchRequestGate
} from '../app/utils/map-native-search'

function nativePoi(overrides: Partial<MapPoi> = {}): MapPoi {
  return {
    id: 'amap-native-coffee',
    name: '湖畔咖啡',
    category: 'food',
    point: { lng: 118.602, lat: 24.908, crs: 'GCJ-02' },
    status: 'published',
    address: '学生街 1 号',
    source: 'amap-native',
    ...overrides
  }
}

function catalogPlace(overrides: Partial<PublicMapPlace> = {}): PublicMapPlace {
  return {
    id: 'catalog-library',
    slug: 'library',
    name: '仰恩大学图书馆',
    scope: 'campus',
    category: 'campus-building',
    summary: '',
    body: '',
    address: '图书馆路',
    campusArea: null,
    openingHours: null,
    phone: null,
    usageChecklist: [],
    point: null,
    pointIsVerified: false,
    usesPreviewPoint: false,
    referenceLabel: null,
    officialPlanNumber: null,
    coordinateVerification: 'verified',
    coordinateSystem: null,
    navigationUrl: null,
    isApiPublished: true,
    searchText: '图书馆 阅读 自习',
    ...overrides
  }
}

test('native AMap POIs become session-only public map places with explicit navigation', () => {
  const place = createNativeMapPlace(nativePoi(), 'campus')
  const navigation = new URL(place.navigationUrl!)

  assert.equal(place.scope, 'campus')
  assert.equal(place.coordinateVerification, 'native-map-session')
  assert.equal(place.coordinateSystem, 'GCJ-02')
  assert.equal(place.pointIsVerified, false)
  assert.equal(place.isApiPublished, false)
  assert.equal(place.referenceLabel, '高德地图临时地点')
  assert.deepEqual(place.usageChecklist, [])
  assert.equal(navigation.origin + navigation.pathname, 'https://uri.amap.com/marker')
  assert.equal(navigation.searchParams.get('position'), '118.602,24.908')
  assert.equal(navigation.searchParams.get('name'), '湖畔咖啡')
  assert.equal(navigation.searchParams.get('coordinate'), 'gaode')
  assert.equal(navigation.searchParams.get('callnative'), '0')
})

test('native places default to nearby scope when the map has no explicit scope', () => {
  assert.equal(createNativeMapPlace(nativePoi(), null).scope, 'nearby')
})

test('native search removes catalog aliases while keeping unrelated visible places', () => {
  const results = buildNativeSearchPlaces([
    nativePoi({ id: 'amap-native-library', name: '图书馆', address: '校内' }),
    nativePoi()
  ], [catalogPlace()], 'campus')

  assert.deepEqual(results.map(place => place.id), ['amap-native-coffee'])
  assert.equal(results[0]?.scope, 'campus')
  assert.match(results[0]?.searchText ?? '', /高德 原生 商家 当前地图/)
})

test('native search request gate rejects stale and cancelled responses', () => {
  const gate = createNativeSearchRequestGate()
  const libraryRequest = gate.begin(' 图书馆 ')

  assert.equal(gate.isCurrent(libraryRequest, '图书馆'), true)

  const coffeeRequest = gate.begin('咖啡')
  assert.equal(gate.isCurrent(libraryRequest, '图书馆'), false)
  assert.equal(gate.isCurrent(coffeeRequest, ' 咖啡 '), true)

  gate.invalidate()
  assert.equal(gate.isCurrent(coffeeRequest, '咖啡'), false)
})
